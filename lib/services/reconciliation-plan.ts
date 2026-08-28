/**
 * Score-reconciliation planning (#667). Sources publish late: LegiScan bills,
 * GovInfo reports, OIG and FR items routinely land on cron day with a
 * published_at three or more weeks back — outside the snapshot's two-week
 * trailing sweep — and nothing scored them until `scores:backfill` was run by
 * hand, while G1a held the digest each Monday. The snapshot now reconciles
 * every unscored eligible document itself before the graph check.
 *
 * Pure: the cron's I/O half (lib/cron/score-reconciliation.ts) feeds it the
 * unscored (category, week) pairs and executes the plan.
 */

export interface CategoryWeek {
  category: string;
  weekOf: string;
}

export interface ReconciliationPlan {
  /** Pairs the run scores + re-aggregates now. */
  inScope: CategoryWeek[];
  /** Analysis-period pairs beyond the per-run cap — reported, next run's work. */
  deferred: CategoryWeek[];
  /** Baseline-period pairs: never touched automatically (owner approval per write). */
  baseline: CategoryWeek[];
}

/** Per-run cap: a bounded amount of unplanned scoring + L2 inside the cron.
 *  A backlog larger than this is a repair, not a Monday side effect. */
export const RECONCILE_MAX_WEEKS = 30;

export function planReconciliation(
  pairs: CategoryWeek[],
  opts: { from: string; maxWeeks?: number },
): ReconciliationPlan {
  const maxWeeks = opts.maxWeeks ?? RECONCILE_MAX_WEEKS;
  const sorted = [...pairs].sort((a, b) =>
    `${a.weekOf}|${a.category}`.localeCompare(`${b.weekOf}|${b.category}`),
  );
  const baseline = sorted.filter((p) => p.weekOf < opts.from);
  const eligible = sorted.filter((p) => p.weekOf >= opts.from);
  // Newest weeks first: the digest week is what the reader sees on Monday.
  eligible.reverse();
  return {
    inScope: eligible.slice(0, maxWeeks),
    deferred: eligible.slice(maxWeeks),
    baseline,
  };
}

const describePairs = (pairs: CategoryWeek[]) =>
  pairs.map((p) => `${p.category} ${p.weekOf}`).join(', ');

/** Error-channel lines for the parts of a plan the run did NOT execute. */
export function describeUnreconciled(plan: ReconciliationPlan): string[] {
  const lines: string[] = [];
  if (plan.deferred.length > 0) {
    lines.push(
      `score reconciliation deferred ${plan.deferred.length} category-week(s) beyond the per-run cap: ${describePairs(plan.deferred)}`,
    );
  }
  if (plan.baseline.length > 0) {
    lines.push(
      `score reconciliation skipped ${plan.baseline.length} BASELINE category-week(s) (owner approval required — pnpm scores:backfill --from <date> --to <date>): ${describePairs(plan.baseline)}`,
    );
  }
  return lines;
}
