/**
 * Score reconciliation (#667): find every eligible document without a score
 * row (G1a's population), score + re-aggregate its category-week, and report
 * what was left alone. Shared by the weekly snapshot (runs before the graph
 * check so a late-published document can no longer hold the digest) and the
 * `scores:backfill` CLI. I/O module — the planning half is pure
 * (lib/services/reconciliation-plan.ts).
 */

import { sql } from 'drizzle-orm';
import { getDocumentsForCategoryWeek } from '@/lib/cron/backfill-document-review';
import { runLayersAndAggregate } from '@/lib/cron/snapshot-layers';
import { SCORE_ELIGIBLE_DOC_SQL } from '@/lib/cron/validate-graph';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { describeUnreconciled, planReconciliation } from '@/lib/services/reconciliation-plan';
import type { CategoryWeek, ReconciliationPlan } from '@/lib/services/reconciliation-plan';
import { getWeekOfDate } from '@/lib/services/weekly-aggregator';
import { formatError } from '@/lib/utils/api-helpers';

/** Derivation-graph grid start (validate-graph GRID_START): G1a's population. */
const GRAPH_GRID_START = '2017-01-20';

/** Distinct (category, weekOf) pairs containing docs with no score row —
 *  G1a's own eligibility predicate, so the two can never disagree (#566). */
export async function findUnscoredPairs(from: string, to?: string): Promise<CategoryWeek[]> {
  // nosemgrep: opengrep.cron-needs-env-config — callers load env in their CLI entry blocks
  const db = getDb();
  const categoryKeys = CATEGORIES.map((c) => c.key);
  const rows = await db.execute(sql`
    SELECT d.category, d.published_at
    FROM documents d
    LEFT JOIN document_scores s ON s.url = d.url AND s.category = d.category
    WHERE s.url IS NULL
      AND d.category IN (${sql.join(
        categoryKeys.map((k) => sql`${k}`),
        sql`, `,
      )})
      AND d.published_at >= ${from}
      AND (${to ?? null}::date IS NULL OR d.published_at < ${to ?? null}::date + 1)
      AND ${SCORE_ELIGIBLE_DOC_SQL}
  `);

  const pairs = new Map<string, CategoryWeek>();
  // db.execute returns raw driver values — published_at arrives as a string.
  for (const r of rows.rows as Array<{ category: string; published_at: string }>) {
    const weekOf = getWeekOfDate(r.published_at);
    pairs.set(`${r.category}|${weekOf}`, { category: r.category, weekOf });
  }
  return [...pairs.values()].sort((a, b) =>
    `${a.category}|${a.weekOf}`.localeCompare(`${b.category}|${b.weekOf}`),
  );
}

export interface ReconciliationResult {
  plan: ReconciliationPlan;
  /** Category-weeks actually scored + re-aggregated. */
  reconciled: number;
  /** Documents scored across those weeks. */
  docsScored: number;
  errors: string[];
}

/**
 * Score + re-aggregate (with L2, deduped) every in-scope unscored
 * category-week. Analysis periods only; baseline pairs are reported for the
 * owner, never written.
 */
export async function reconcileUnscoredDocs(): Promise<ReconciliationResult> {
  const pairs = await findUnscoredPairs(GRAPH_GRID_START);
  const plan = planReconciliation(pairs, { from: T2_INAUGURATION });
  const errors = describeUnreconciled(plan);
  let reconciled = 0;
  let docsScored = 0;
  for (const { category, weekOf } of plan.inScope) {
    try {
      const stored = await getDocumentsForCategoryWeek(category, weekOf);
      if (stored.length === 0) continue;
      await storeDocumentScores(scoreDocumentBatch(stored, category));
      const { errors: layerErrors } = await runLayersAndAggregate(stored, category, weekOf);
      errors.push(...layerErrors);
      reconciled++;
      docsScored += stored.length;
      console.log(`[reconcile] ${category} ${weekOf}: scored ${stored.length} docs, re-aggregated`);
    } catch (err) {
      errors.push(`score reconciliation failed for ${category} ${weekOf}: ${formatError(err)}`);
    }
  }
  return { plan, reconciled, docsScored, errors };
}
