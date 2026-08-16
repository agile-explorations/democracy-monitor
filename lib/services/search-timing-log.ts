/**
 * Search-degradation capture (#727): every docsOnly retrieval build records
 * its phase timings to search_timings; builds over threshold are flagged and
 * emailed to the operator immediately (cooldown-limited), with everything
 * needed to diagnose after the fact — when, the exact search, the phase
 * breakdown, the running release, and the weekly-schedule windows to
 * correlate against. Capture, not trend-tracking: rows are raw and never
 * averaged; A/B tests own "did it improve" (owner doctrine, 2026-08-16).
 * Failure-tolerant with a VISIBLE warn (never affects the response).
 */

import { sql } from 'drizzle-orm';
import { cacheGet, cacheSet } from '@/lib/cache';
import { getDb, isDbAvailable } from '@/lib/db';
import { searchTimings } from '@/lib/db/schema';
import { sendOpsAlert } from '@/lib/services/ops-alert-service';
import pkg from '@/package.json';

/** Absolute per-phase ceilings; a healthy prewarmed build sits well under
 *  all of them (heaviest comparatives ≈13-20s total, search ≈6-8s/window). */
export const SEARCH_TIMING_THRESHOLDS = {
  embedMs: 5_000,
  expansionMs: 15_000,
  retrieveWallMs: 15_000,
  totalMs: 30_000,
} as const;

/** At most one degradation email per window; flagged rows still accumulate
 *  and the next email reports how many the cooldown suppressed. */
const ALERT_COOLDOWN_SECONDS = 6 * 3600;
// RETENTION: indefinite raw, no roll-up, NO prune (owner decision,
// 2026-08-16). Raw rows answer questions aggregates cannot — event
// alignment, reformulation chains, demand-vs-ingest lag, unforeseen future
// analyses — and cost ~nothing at this volume (~300-500 bytes/row).
// Revisit only if volume grows ~100x or the data-holding posture changes.

export interface SearchTimingRecord {
  query: string;
  queryHash: string;
  params: Record<string, string | boolean | null>;
  /** 'build' = retrieval ran; 'cache' = served from docsOnly cache (behavior
   *  row, no timings); 'empty' = retrieval found nothing (#727). */
  served: 'build' | 'cache' | 'empty';
  /** Documents returned; 0 on 'empty', undefined on 'cache'. */
  docCount?: number;
  embedMs?: number;
  expansionMs?: number;
  retrieveWallMs?: number;
  totalMs?: number;
  windows?: Array<{ key: string; searchMs: number; rerankMs: number }>;
}

/** Threshold check — returns the human-readable reasons tripped, or null.
 *  Pure — unit-tested. */
export function classifyDegradation(t: {
  embedMs: number;
  expansionMs: number;
  retrieveWallMs: number;
  totalMs: number;
}): string | null {
  const reasons = (
    Object.entries(SEARCH_TIMING_THRESHOLDS) as Array<
      [keyof typeof SEARCH_TIMING_THRESHOLDS, number]
    >
  )
    .filter(([phase, limit]) => t[phase] > limit)
    .map(([phase, limit]) => `${phase}=${t[phase]}ms exceeds ${limit}ms`);
  return reasons.length > 0 ? reasons.join('; ') : null;
}

/** Alert body: everything needed to place the event in time and context.
 *  Pure — unit-tested. */
export function buildDegradationDetails(
  record: SearchTimingRecord,
  reason: string,
  measuredAt: Date,
  suppressedRecently: number,
): string[] {
  return [
    `When: ${measuredAt.toISOString()} (UTC ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][measuredAt.getUTCDay()]} ${String(measuredAt.getUTCHours()).padStart(2, '0')}:${String(measuredAt.getUTCMinutes()).padStart(2, '0')})`,
    `Search: ${record.query}`,
    `Params: ${JSON.stringify(record.params)}`,
    `Threshold tripped: ${reason}`,
    `Phases: embed=${record.embedMs}ms expansion=${record.expansionMs}ms retrieveWall=${record.retrieveWallMs}ms total=${record.totalMs}ms`,
    `Windows: ${(record.windows ?? []).map((w) => `${w.key} search=${w.searchMs}ms rerank=${w.rerankMs}ms`).join(' | ')}`,
    `Release: v${pkg.version} @ ${process.env.RENDER_GIT_COMMIT ?? 'unknown'}`,
    `Weekly schedule (UTC Mon): LegiScan 01:00 · snapshot ingest 03:00 · dump+prewarm 05:00 · docs pre-warm 06:00. Deploys: see /api/version history.`,
    ...(suppressedRecently > 0
      ? [
          `Note: ${suppressedRecently} additional flagged build(s) in the cooldown window before this alert.`,
        ]
      : []),
  ];
}

async function maybeAlert(record: SearchTimingRecord, reason: string): Promise<void> {
  const cooldownKey = 'ops:search-timing-alert-cooldown:v1';
  if (await cacheGet<boolean>(cooldownKey)) {
    console.warn(`[search-timing] degradation flagged (alert in cooldown): ${reason}`);
    return;
  }
  await cacheSet(cooldownKey, true, ALERT_COOLDOWN_SECONDS);
  const db = getDb();
  const since = new Date(Date.now() - ALERT_COOLDOWN_SECONDS * 1000);
  const suppressed = await db.execute(
    sql`SELECT count(*)::int AS n FROM search_timings WHERE flagged AND measured_at > ${since.toISOString()}`,
  );
  const suppressedRecently = Number(suppressed.rows[0]?.n ?? 0);
  await sendOpsAlert(
    `Search performance degradation: ${record.totalMs}ms build`,
    buildDegradationDetails(record, reason, new Date(), suppressedRecently),
  );
}

/** Record one interaction; flag + alert on threshold trips.
 *  Fire-and-forget from the route — never throws into the response path,
 *  but failures WARN so a blind detector is visible in logs. */
export async function recordSearchTiming(record: SearchTimingRecord): Promise<void> {
  if (!isDbAvailable()) return;
  try {
    // Cache serves carry no timings — behavior rows only; degradation
    // classification applies to rows where retrieval actually ran.
    const reason =
      record.served === 'cache'
        ? null
        : classifyDegradation({
            embedMs: record.embedMs ?? 0,
            expansionMs: record.expansionMs ?? 0,
            retrieveWallMs: record.retrieveWallMs ?? 0,
            totalMs: record.totalMs ?? 0,
          });
    const db = getDb();
    await db.insert(searchTimings).values({
      query: record.query.slice(0, 2000),
      queryHash: record.queryHash,
      params: record.params,
      served: record.served,
      docCount: record.docCount ?? null,
      embedMs: record.embedMs ?? null,
      expansionMs: record.expansionMs ?? null,
      retrieveWallMs: record.retrieveWallMs ?? null,
      totalMs: record.totalMs ?? null,
      windows: record.windows ?? null,
      appVersion: pkg.version,
      gitCommit: process.env.RENDER_GIT_COMMIT ?? null,
      flagged: reason != null,
      flagReason: reason,
    });
    if (reason != null) await maybeAlert(record, reason);
  } catch (err) {
    console.warn('[search-timing] record failed (detector blind for this build):', err);
  }
}
