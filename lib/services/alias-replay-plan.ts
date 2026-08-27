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

/** Rows seen within `windowDays` of `now`, most RECENTLY demanded first
 *  (cost as the tie-break). Recency is the reuse signal: a novel wording
 *  of a topic people are asking about now hits these. Cost-first was
 *  measured to spend the whole budget on 60s zero-match mined phrases
 *  (2026-08-27 rehearsal) — the least reusable work. Pure. */
export function planReplay<T extends ReplayRow>(rows: T[], now: Date, windowDays: number): T[] {
  const since = now.getTime() - windowDays * 86400 * 1000;
  return rows
    .filter((r) => r.lastSeenAt.getTime() >= since)
    .sort(
      (a, b) =>
        b.lastSeenAt.getTime() - a.lastSeenAt.getTime() || b.lastDurationMs - a.lastDurationMs,
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
