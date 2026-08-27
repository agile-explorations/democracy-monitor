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
import { dbWorkGate, noteCacheEvent } from '@/lib/services/db-work-gate';
import { mapConcurrent, sleep } from '@/lib/utils/async';
import { envInt } from '@/lib/utils/env';

type Db = ReturnType<typeof getDb>;
type SqlChunk = ReturnType<typeof sql>;

/** 'research'/'explore' rows replay an arm query; 'validation' rows replay
 *  an expansion corpus-count (#729 follow-up: validation pays the same
 *  per-alias phrase-recheck cost the arms do). */
export type ArmKind = 'research' | 'explore' | 'validation';

export interface KeyedArm {
  kind: ArmKind;
  phrase: string;
  /** Stable hash of the window/filter params the arm query was built with. */
  paramsHash: string;
  /** The raw params, persisted to the ledger so replay can rebuild the query. */
  params: Record<string, string | null>;
  query: SqlChunk;
}

/** An arm or count slower than this live gets a warning line; every
 *  real-demand cache miss is ledgered regardless (#788). */
export const SLOW_ARM_MS = 5_000;
/** Cache slightly past the data week so Monday replay overlaps, never gaps. */
export const ARM_CACHE_TTL_SECONDS = 8 * 86400;

/** Case-insensitive phrase identity for cache keys. Pure. */
export function hashPhrase(phrase: string): string {
  return createHash('sha256').update(phrase.toLowerCase()).digest('hex').slice(0, 16);
}

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
  return CacheKeys.searchArm(arm.kind, dataWeekStamp(), arm.paramsHash, hashPhrase(arm.phrase));
}

/** Fire-and-forget ledger upsert — never blocks or fails the response.
 *  Shared by arm execution and validation counting (#729 follow-up). Since
 *  #788 every real-demand cache miss lands here (not only slow ones): the
 *  ledger is the demand record the Monday replay pre-pays into the fresh
 *  data week. Replay refreshes never ledger themselves, so rows age out
 *  by real `last_seen_at`. */
export function ledgerSlowAliasWork(
  db: Db,
  work: Pick<KeyedArm, 'kind' | 'phrase' | 'paramsHash' | 'params'>,
  durationMs: number,
): void {
  void db
    .insert(slowAliases)
    .values({
      phrase: work.phrase,
      kind: work.kind,
      paramsHash: work.paramsHash,
      params: work.params,
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
    if (cached) {
      noteCacheEvent('arm', true);
      return cached;
    }
    noteCacheEvent('arm', false);
  }
  const started = Date.now();
  const rows = (
    await dbWorkGate(() =>
      db.transaction(async (tx) => {
        // Safety ceiling only — nothing legitimate gets near it (worst
        // observed arm: 37s); a runaway alias must not pin the 1-CPU DB.
        // Literal because SET LOCAL cannot take a bind parameter.
        await tx.execute(sql`SET LOCAL statement_timeout = 120000`);
        return tx.execute(arm.query);
      }),
    )
  ).rows as Record<string, unknown>[];
  const durationMs = Date.now() - started;
  await cacheSet(key, rows, ARM_CACHE_TTL_SECONDS);
  if (!forceRefresh) ledgerSlowAliasWork(db, arm, durationMs);
  if (durationMs > SLOW_ARM_MS) {
    console.warn(`[arm-cache] slow arm ${arm.kind}/${arm.phrase}: ${durationMs}ms`);
  }
  return rows;
}

/** Postgres 57014 (statement timeout) anywhere in the error's cause chain.
 *  Pure — exported for tests. */
export function isStatementTimeout(err: unknown): boolean {
  for (let e = err as { code?: string; cause?: unknown } | undefined; e; e = e.cause as never) {
    if (e.code === '57014') return true;
  }
  return false;
}

/** Concurrent arm statements, derived empirically per DB tier (#782 WO-3).
 *  History: 10-wide fan-out under a cold cache thrashed the then-1-CPU DB
 *  until 1s queries blew the 120s ceiling and arms silently vanished
 *  (2026-08-24 incident) — cut to 5. On basic-4gb (2 CPU), a cold P0 at 8
 *  cut the parallel-stage tails 50-70% (alias-arms p95 216s→64s) with zero
 *  degraded arms; warm-regime work is CPU-bound and insensitive. 8 leaves
 *  the 10-client pool two clients of headroom. Env-overridable within
 *  [1,10] for sweeps and incident tuning. */
const ARM_QUERY_CONCURRENCY = envInt('ARM_QUERY_CONCURRENCY', 8, 1, 10);
const TIMEOUT_RETRY_DELAY_MS = 3_000;

/** Execute keyed alias arms with bounded concurrency, tolerating per-arm
 *  failures — a failed arm degrades to an empty list and caches nothing. A
 *  statement-timeout kill gets ONE delayed retry (contention is transient;
 *  the retry usually lands once the burst drains). Dropped arms are counted
 *  and logged as a summary so degraded builds are visible (#778). */
export async function runKeyedArms(arms: KeyedArm[]): Promise<Record<string, unknown>[][]> {
  const db = getDb();
  const dropped: string[] = [];
  const results = await mapConcurrent(arms, ARM_QUERY_CONCURRENCY, async (arm) => {
    try {
      return await runCachedArm(db, arm);
    } catch (err) {
      if (isStatementTimeout(err)) {
        await sleep(TIMEOUT_RETRY_DELAY_MS);
        try {
          return await runCachedArm(db, arm);
        } catch (retryErr) {
          console.warn(`[arm-cache] alias arm failed after retry (skipped): ${arm.phrase}`);
          dropped.push(arm.phrase);
          return [];
        }
      }
      console.warn(`[arm-cache] alias arm failed (skipped): ${arm.phrase}`, err);
      dropped.push(arm.phrase);
      return [];
    }
  });
  if (dropped.length > 0) {
    console.warn(
      `[arm-cache] DEGRADED BUILD: ${dropped.length}/${arms.length} arms dropped: ${dropped.join(', ')}`,
    );
  }
  return results;
}
