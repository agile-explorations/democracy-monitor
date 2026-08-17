/**
 * Alias validation counting + per-alias count caching (#729 follow-up).
 *
 * Expansion validation pays the same GIN phrase-recheck cost the arms do —
 * per NOVEL WORDING, because the end-to-end expansion cache keys on query
 * text (measured ~60s on pathological topics). Counts here are cached per
 * (alias, window, data week), so recurring topics stop re-paying whatever
 * the wording; zero counts cache too (zero-match phrases scan the entire
 * candidate set — the worst case). Slow counts join the slow-alias ledger
 * for the Monday replay (warmAliasValidation is the replay entry point).
 */

import { sql } from 'drizzle-orm';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { DISCUSSION_SOURCE_TYPES } from '@/lib/data/document-tiers';
import { getDb } from '@/lib/db';
import {
  ARM_CACHE_TTL_SECONDS,
  dataWeekStamp,
  hashArmParams,
  hashPhrase,
  ledgerSlowAliasWork,
  SLOW_ARM_MS,
} from '@/lib/services/arm-cache';
import { SEARCH_EXCLUDED_ORIGINS } from '@/lib/services/search-queries';

export interface ExpansionWindow {
  dateFrom?: string;
  dateTo?: string;
  tier?: DocumentTier;
  category?: string;
}

/** An alias may match at most this share of the searched window. */
export const MAX_WINDOW_SHARE = 0.05;

/** Small windows: absolute floor for the match cap. */
export const MIN_MATCH_CAP = 200;

/** Absolute ceiling for alias admission, aligned with the fusion math: an
 *  arm's weight (1/(1+log10(1+n/100))) falls below the ~0.67 RRF surfacing
 *  threshold near n≈1000 — broader aliases cannot surface results but cost
 *  the most to rank (each match detoasts a ~20KB rank vector; one broad arm
 *  measured 31s on cold prod cache, 2026-08-11). */
export const MAX_MATCH_CAP = 1000;

/** Window filter clause for validation counts. Exported for tests. */
export function windowFilters(w: ExpansionWindow) {
  const conditions = [
    sql`d.embedding IS NOT NULL`,
    sql`d.retrieval_relevant IS NOT FALSE`,
    sql`d.content_type != 'metadata_only'`,
    sql`d.category != 'intent'`,
    sql`d.source_origin IS NOT NULL`,
    sql`d.source_origin NOT IN (${sql.join(
      SEARCH_EXCLUDED_ORIGINS.map((o) => sql`${o}`),
      sql`, `,
    )})`,
  ];
  if (w.dateFrom) conditions.push(sql`d.published_at >= ${w.dateFrom}::timestamptz`);
  if (w.dateTo) conditions.push(sql`d.published_at <= ${w.dateTo}::timestamptz`);
  if (w.category) conditions.push(sql`d.category = ${w.category}`);
  if (w.tier) {
    const types = sql.join(
      [...DISCUSSION_SOURCE_TYPES].map((t) => sql`${t}`),
      sql`, `,
    );
    conditions.push(
      w.tier === 'action' ? sql`d.source_type NOT IN (${types})` : sql`d.source_type IN (${types})`,
    );
  }
  return sql.join(conditions, sql` AND `);
}

/** Window-size counting saturates here: caps validation work on broad
 *  windows (an unbounded count over a no-filter window scanned ~400k rows —
 *  the whole 60s edge-timeout budget on a cold prod cache, 2026-08-11). */
const WINDOW_COUNT_CAP = 100000;

/** Bounded count: scans at most `cap` matching rows instead of the full set.
 *  Runs under the same 120s safety ceiling the arms use (#729): a sparse-
 *  adjacency phrase recheck must not pin the 1-CPU database. */
async function cappedCount(
  db: ReturnType<typeof getDb>,
  where: ReturnType<typeof sql>,
  cap: number,
): Promise<number> {
  const r = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = 120000`);
    return tx.execute(sql`
    SELECT count(*) AS n FROM (
      SELECT 1 FROM documents d WHERE ${where} LIMIT ${cap}
    ) capped`);
  });
  return Number((r.rows[0] as { n: string }).n);
}

/** Cached-count usability rule (#729 follow-up). A stored count is EXACT
 *  when it came in under its cap (the scan found the true total); a
 *  saturated count (matches == cap+1) is only reusable when the stored cap
 *  covers the current one. Pure — unit-tested. */
export function cachedCountUsable(cached: { matches: number; cap: number }, cap: number): boolean {
  return cached.matches <= cached.cap || cached.cap >= cap;
}

const windowHashOf = (w: ExpansionWindow) =>
  hashArmParams({
    dateFrom: w.dateFrom ?? null,
    dateTo: w.dateTo ?? null,
    tier: w.tier ?? null,
    category: w.category ?? null,
  });

/** Window-size count, cached per (window, data week) — the corpus only
 *  changes on Monday ingest, and this cost a 100k-row scan per query. */
export async function cachedWindowTotal(
  db: ReturnType<typeof getDb>,
  window: ExpansionWindow,
  filters: ReturnType<typeof sql>,
  forceRefresh = false,
): Promise<number> {
  const key = CacheKeys.searchWindowTotal(dataWeekStamp(), windowHashOf(window));
  if (!forceRefresh) {
    const cached = await cacheGet<number>(key);
    if (cached != null) return cached;
  }
  const total = await cappedCount(db, filters, WINDOW_COUNT_CAP);
  await cacheSet(key, total, ARM_CACHE_TTL_SECONDS);
  return total;
}

/**
 * Per-alias validation count, cached per (phrase, window, data week) (#729
 * follow-up): validation pays the arm-class phrase-recheck cost PER NOVEL
 * WORDING (measured ~60s on pathological topics) because the end-to-end
 * expansion cache keys on query text. The count is per ALIAS — recurring
 * topics stop re-paying it, whatever the wording. Zero counts cache too
 * (zero-match phrases scan the entire candidate set — the worst case).
 * Slow counts join the slow-alias ledger for the Monday replay.
 */
export async function cachedAliasCount(
  db: ReturnType<typeof getDb>,
  phrase: string,
  window: ExpansionWindow,
  filters: ReturnType<typeof sql>,
  cap: number,
  forceRefresh = false,
): Promise<number> {
  const windowHash = windowHashOf(window);
  const key = CacheKeys.searchAliasCount(dataWeekStamp(), windowHash, hashPhrase(phrase));
  if (!forceRefresh) {
    const cached = await cacheGet<{ matches: number; cap: number }>(key);
    if (cached != null && cachedCountUsable(cached, cap)) {
      return Math.min(cached.matches, cap + 1);
    }
  }
  const quoted = `"${phrase.replace(/"/g, '')}"`;
  const matchFilter = sql`${filters}
    AND d.search_vector @@ websearch_to_tsquery('english', ${quoted})`;
  const started = Date.now();
  const matches = await cappedCount(db, matchFilter, cap + 1);
  const durationMs = Date.now() - started;
  await cacheSet(key, { matches, cap }, ARM_CACHE_TTL_SECONDS);
  if (durationMs > SLOW_ARM_MS) {
    ledgerSlowAliasWork(
      db,
      {
        kind: 'validation',
        phrase,
        paramsHash: windowHash,
        params: {
          dateFrom: window.dateFrom ?? null,
          dateTo: window.dateTo ?? null,
          tier: window.tier ?? null,
          category: window.category ?? null,
        },
      },
      durationMs,
    );
  }
  return matches;
}

/** Replay entry point (#729): force-refresh one alias's validation count
 *  into the fresh data week's cache. */
export async function warmAliasValidation(phrase: string, window: ExpansionWindow): Promise<void> {
  const db = getDb();
  const filters = windowFilters(window);
  const windowTotal = await cachedWindowTotal(db, window, filters, true);
  const cap = Math.max(
    MIN_MATCH_CAP,
    Math.min(MAX_MATCH_CAP, Math.floor(windowTotal * MAX_WINDOW_SHARE)),
  );
  await cachedAliasCount(db, phrase, window, filters, cap, true);
}
