/**
 * Aggregate-parity reconciliation (#825): the safety net that runs before the
 * derivation-graph check. Any path that adds or removes score rows in a week
 * whose aggregate is not re-derived — a late-arriving document, a filter
 * repair, a dedupe cascade — leaves `weekly_aggregates.document_count` off
 * by the difference, and G2b held the digest every Monday it happened.
 * This step recomputes the bare count row (enrichment preserved, so no
 * status can flip here) for current-term mismatches and reports baseline
 * mismatches by name with their owner-run repair command. I/O module — the
 * population query lives with the invariant (validate-graph.ts) so the two
 * can never disagree; planning is the pure reconciliation planner (#667).
 */

import { describeParityMismatch, findCountParityMismatches } from '@/lib/cron/validate-graph';
import type { CountParityMismatch } from '@/lib/cron/validate-graph';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { categoryWeekKey } from '@/lib/services/category-week-grouping';
import { describeBaselinePairs, planReconciliation } from '@/lib/services/reconciliation-plan';
import type { ReconciliationPlan } from '@/lib/services/reconciliation-plan';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { formatError } from '@/lib/utils/api-helpers';

export interface AggregateReconciliationResult {
  plan: ReconciliationPlan;
  /** Current-term category-weeks whose count row was recomputed. */
  recomputed: CountParityMismatch[];
  errors: string[];
}

export async function reconcileAggregateCounts(): Promise<AggregateReconciliationResult> {
  const mismatches = await findCountParityMismatches();
  const byKey = new Map(mismatches.map((m) => [categoryWeekKey(m.category, m.weekOf), m]));
  const plan = planReconciliation(mismatches, { from: T2_INAUGURATION });
  const errors: string[] = [];
  if (plan.deferred.length > 0) {
    errors.push(
      `aggregate parity deferred ${plan.deferred.length} category-week(s) beyond the per-run cap: ` +
        plan.deferred.map((p) => `${p.category} ${p.weekOf}`).join(', '),
    );
  }
  if (plan.baseline.length > 0) {
    errors.push(
      describeBaselinePairs(
        'aggregate parity',
        plan.baseline.map((p) => {
          const m = byKey.get(categoryWeekKey(p.category, p.weekOf));
          return { ...p, detail: m ? `agg=${m.aggCount} scores=${m.scoreCount}` : undefined };
        }),
      ),
    );
  }
  const recomputed: CountParityMismatch[] = [];
  for (const { category, weekOf } of plan.inScope) {
    try {
      await storeWeeklyAggregate(await computeWeeklyAggregate(category, weekOf));
      const m = byKey.get(categoryWeekKey(category, weekOf));
      if (m) recomputed.push(m);
    } catch (err) {
      errors.push(
        `aggregate parity recompute failed for ${category} ${weekOf}: ${formatError(err)}`,
      );
    }
  }
  if (recomputed.length > 0) {
    console.log(
      `[reconcile] aggregate parity: recomputed ${recomputed.length} category-week(s): ` +
        recomputed.map(describeParityMismatch).join('; '),
    );
  }
  return { plan, recomputed, errors };
}
