/**
 * Per-cluster memory for the CourtListener opinion-first pass (#741) — the
 * planning half, pure.
 *
 * CourtListener publishes a cluster before its plain text is extracted; the
 * pass used to drop such a cluster silently and never revisit its week, so
 * one skipped cluster was lost forever (Trump v. Cook). The ledger records
 * every outcome per cluster; this planner decides, for a search window, which
 * clusters to skip (already stored, or routed to nothing) and which to try
 * again (no text yet, or a fetch error) — bounded by a retry ceiling and a
 * per-run fetch cap so the trailing window stays cheap.
 */

export type ClusterOutcome = 'stored' | 'no_text' | 'zero_categories' | 'fetch_error';

export interface LedgerEntry {
  reason: ClusterOutcome;
  attempts: number;
}

/** Outcomes that never get another attempt: the document exists, or the
 *  opinion routed to no category (its text was read; it is off-topic). */
const FINAL_OUTCOMES = new Set<ClusterOutcome>(['stored', 'zero_categories']);

/** Retries per cluster across trailing runs (weeks) before giving up. */
export const CL_MAX_RETRIES = 6;

export interface ClusterAttemptPlan<T> {
  attempt: T[];
  skippedFinal: number;
  skippedExhausted: number;
  /** Clusters beyond the per-run fetch cap — next run's work. */
  deferred: number;
}

export function planClusterAttempts<T>(
  clusters: T[],
  idOf: (c: T) => number,
  ledger: Map<number, LedgerEntry>,
  opts: { maxFetches?: number; maxRetries?: number } = {},
): ClusterAttemptPlan<T> {
  const maxRetries = opts.maxRetries ?? CL_MAX_RETRIES;
  const plan: ClusterAttemptPlan<T> = {
    attempt: [],
    skippedFinal: 0,
    skippedExhausted: 0,
    deferred: 0,
  };
  for (const c of clusters) {
    const entry = ledger.get(idOf(c));
    if (entry && FINAL_OUTCOMES.has(entry.reason)) {
      plan.skippedFinal++;
      continue;
    }
    if (entry && entry.attempts >= maxRetries) {
      plan.skippedExhausted++;
      continue;
    }
    if (opts.maxFetches != null && plan.attempt.length >= opts.maxFetches) {
      plan.deferred++;
      continue;
    }
    plan.attempt.push(c);
  }
  return plan;
}
