/**
 * Pure planning for the Monday alias replay (#788): which ledger rows to
 * pre-pay into the fresh data week, in what order, and how to summarize
 * the run. The I/O lives in lib/cron/replay-slow-aliases.ts.
 */

export interface ReplayRow {
  phrase: string;
  kind: string;
  lastDurationMs: number;
  lastSeenAt: Date;
}

/** A validation count at or above this took the "junk" path: a mined
 *  phrase whose words co-occur widely but never as a phrase, so the GIN
 *  phrase recheck touches thousands of heap pages. Measured 2026-08-27 on
 *  dev: rows ≥30s were 1,746 of 5,255 validation rows but 91% of all
 *  replay cost, with the lowest reuse odds. They go last. */
export const JUNK_COUNT_MS = 30_000;

/** Replay priority tier: 0 = arms (validated aliases, highest reuse),
 *  1 = ordinary counts, 2 = junk-class counts. Pure. */
export function replayTier(row: Pick<ReplayRow, 'kind' | 'lastDurationMs'>): 0 | 1 | 2 {
  if (row.kind !== 'validation') return 0;
  return row.lastDurationMs >= JUNK_COUNT_MS ? 2 : 1;
}

/** Rows seen within `windowDays` of `now`, ordered by tier (arms → counts →
 *  junk counts), then most RECENTLY demanded first, then cost. Recency is
 *  the reuse signal; cost-first alone was measured to spend a whole budget
 *  on 60s zero-match mined phrases (2026-08-27 rehearsal: 431 of 4,804
 *  rows warmed). Pure. */
export function planReplay<T extends ReplayRow>(rows: T[], now: Date, windowDays: number): T[] {
  const since = now.getTime() - windowDays * 86400 * 1000;
  return rows
    .filter((r) => r.lastSeenAt.getTime() >= since)
    .sort(
      (a, b) =>
        replayTier(a) - replayTier(b) ||
        b.lastSeenAt.getTime() - a.lastSeenAt.getTime() ||
        b.lastDurationMs - a.lastDurationMs,
    );
}

export interface ReplayTally {
  arms: number;
  counts: number;
  failed: number;
  skipped: number;
  ledgered: number;
  elapsedMs: number;
  budgetMs: number;
}

/** The one line the dump log keeps. Pure. */
export function summarizeReplay(t: ReplayTally): string {
  const s = (ms: number) => `${(ms / 1000).toFixed(0)}s`;
  const budget = t.skipped > 0 ? ` (${t.skipped} skipped at the ${s(t.budgetMs)} budget)` : '';
  return (
    `[alias-replay] warmed ${t.arms} arms + ${t.counts} counts, ${t.failed} failed` +
    `${budget} in ${s(t.elapsedMs)} — ${t.ledgered} ledger rows in window`
  );
}
