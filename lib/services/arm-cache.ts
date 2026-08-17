/**
 * Per-alias arm result caching + slow-alias ledger (#729).
 *
 * The expensive part of a keyword arm is GIN phrase-recheck I/O, and it is
 * paid per ALIAS — a canonical, corpus-validated phrase that recurs across
 * differently-worded queries. Caching each arm's complete ranked rows keyed
 * on (kind, phrase, filter params, data week) lets any wording of the same
 * topic skip the arm SQL for the rest of the data week. Only COMPLETE
 * results are ever cached: a failed or safety-ceiling-cut arm caches
 * nothing, so the next request retries.
 *
 * Arms whose live execution exceeds SLOW_ARM_MS are upserted into the
 * slow_aliases ledger; the Monday post-dump replay (replay-slow-aliases.ts)
 * re-runs them into the fresh week's cache so recurring pathological topics
 * have no first-payer.
 */

import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { getDb } from '@/lib/db';
import { slowAliases } from '@/lib/db/schema';

type Db = ReturnType<typeof getDb>;
type SqlChunk = ReturnType<typeof sql>;

export type ArmKind = 'research' | 'explore';

export interface KeyedArm {
  kind: ArmKind;
  phrase: string;
  /** Stable hash of the window/filter params the arm query was built with. */
  paramsHash: string;
  /** The raw params, persisted to the ledger so replay can rebuild the query. */
  params: Record<string, string | null>;
  query: SqlChunk;
}

/** An arm slower than this live is ledgered for the Monday replay. */
export const SLOW_ARM_MS = 5_000;
/** Cache slightly past the data week so Monday replay overlaps, never gaps. */
const ARM_CACHE_TTL_SECONDS = 8 * 86400;

export function hashArmParams(params: Record<string, string | null | undefined>): string {
  const stable = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k] ?? ''}`)
    .join('&');
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

/** Monday (UTC) of the current data week — cache keys roll after each
 *  weekly ingest, so entries never serve a stale corpus. Pure. */
export function dataWeekStamp(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function armKey(arm: Pick<KeyedArm, 'kind' | 'phrase' | 'paramsHash'>): string {
  const phraseHash = createHash('sha256')
    .update(arm.phrase.toLowerCase())
    .digest('hex')
    .slice(0, 16);
  return CacheKeys.searchArm(arm.kind, dataWeekStamp(), arm.paramsHash, phraseHash);
}

/** Fire-and-forget ledger upsert — never blocks or fails the response. */
function ledgerSlowAlias(db: Db, arm: KeyedArm, durationMs: number): void {
  void db
    .insert(slowAliases)
    .values({
      phrase: arm.phrase,
      kind: arm.kind,
      paramsHash: arm.paramsHash,
      params: arm.params,
      lastDurationMs: durationMs,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [slowAliases.phrase, slowAliases.kind, slowAliases.paramsHash],
      set: { lastDurationMs: durationMs, lastSeenAt: new Date() },
    })
    .catch((err: unknown) => console.warn('[arm-cache] slow-alias ledger failed:', err));
}

/**
 * Execute one arm with caching: cache hit returns the stored rows; a miss
 * runs the query under the safety ceiling, caches the COMPLETE result, and
 * ledgers the alias when slow. `forceRefresh` (replay) skips the read but
 * still writes.
 */
export async function runCachedArm(
  db: Db,
  arm: KeyedArm,
  forceRefresh = false,
): Promise<Record<string, unknown>[]> {
  const key = armKey(arm);
  if (!forceRefresh) {
    const cached = await cacheGet<Record<string, unknown>[]>(key);
    if (cached) return cached;
  }
  const started = Date.now();
  const rows = (
    await db.transaction(async (tx) => {
      // Safety ceiling only — nothing legitimate gets near it (worst
      // observed arm: 37s); a runaway alias must not pin the 1-CPU DB.
      // Literal because SET LOCAL cannot take a bind parameter.
      await tx.execute(sql`SET LOCAL statement_timeout = 120000`);
      return tx.execute(arm.query);
    })
  ).rows as Record<string, unknown>[];
  const durationMs = Date.now() - started;
  await cacheSet(key, rows, ARM_CACHE_TTL_SECONDS);
  if (durationMs > SLOW_ARM_MS) ledgerSlowAlias(db, arm, durationMs);
  return rows;
}

/** Execute keyed alias arms concurrently, tolerating per-arm failures —
 *  a failed/ceiling-cut arm degrades to an empty list and caches nothing. */
export async function runKeyedArms(arms: KeyedArm[]): Promise<Record<string, unknown>[][]> {
  const db = getDb();
  return Promise.all(
    arms.map(async (arm) => {
      try {
        return await runCachedArm(db, arm);
      } catch (err) {
        console.warn(`[arm-cache] alias arm failed (skipped): ${arm.phrase}`, err);
        return [];
      }
    }),
  );
}
