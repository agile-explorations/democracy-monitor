/**
 * Per-category-week layer processing for the snapshot pipeline: L2 assessment,
 * decoupled actor attribution (#537), and weekly aggregate build/enrich/store.
 * Extracted from snapshot.ts (max-lines).
 */

import {
  categoryWeekKey,
  lateArrivalFlips,
  orderKeysAnchorLast,
  parseCategoryWeekKey,
  partitionGroupsByTerm,
} from '@/lib/services/category-week-grouping';
import type { CategoryWeekGroups } from '@/lib/services/category-week-grouping';
import { captureStatuses, diffStatuses } from '@/lib/services/pipeline-repair-gates';
import type { StatusSnapshot } from '@/lib/services/pipeline-repair-gates';
import { describeBaselinePairs } from '@/lib/services/reconciliation-plan';
import {
  computeWeeklyAggregate,
  storeEnrichedWeeklyAggregate,
  storeWeeklyAggregate,
} from '@/lib/services/weekly-aggregator';
import { enrichWithLayerScores } from '@/lib/services/weekly-enrichment';
import type { ContentItem } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';

export interface AggregateFailure {
  category: string;
  weekOf: string;
}

/** Run Layer 2 AI assessment + weekly aggregate computation. Returns failure info if aggregate fails. */
export async function runLayersAndAggregate(
  items: ContentItem[],
  category: string,
  weekOf: string,
): Promise<{ aggregateFailure: AggregateFailure | null; errors: string[] }> {
  const errors: string[] = [];

  // Run L2 on freshly fetched items (stores individual assessments in DB)
  try {
    const { runLayer2Assessment } = await import('@/lib/services/document-review-orchestrator');
    const l2Result = await runLayer2Assessment(items, category, weekOf);
    if (l2Result) {
      console.log(
        `[snapshot]   Layer 2: ${l2Result.flagCount}/${l2Result.totalDocuments} flagged, ` +
          `concern rate ${(l2Result.concernRate * 100).toFixed(1)}%`,
      );
    }
  } catch (err) {
    const msg = `Layer 2 failed for ${category}: ${formatError(err)}`;
    console.warn(`[snapshot] ${msg}`);
    errors.push(msg);
  }

  // Attribute erosionActor on this week's freshly confirmed docs BEFORE the
  // aggregate is built, so ai_detail.actorConfirmations is current. Decoupled
  // light pass (#537) — non-fatal, never touches assessment fields.
  try {
    const { runActorAttribution } = await import('@/lib/services/actor-attribution');
    const { addDays } = await import('@/lib/utils/date-utils');
    const attributed = await runActorAttribution({
      from: weekOf,
      to: addDays(weekOf, 6),
      category,
    });
    if (attributed.written > 0) {
      console.log(`[snapshot]   Actor attribution: ${attributed.written} docs`);
    }
  } catch (err) {
    errors.push(`Actor attribution failed for ${category}: ${formatError(err)}`);
  }

  try {
    // Build AI summary from ALL stored assessments (not just the fresh batch)
    const { buildAISummaryFromDB } = await import('@/lib/services/document-review-summary');
    const aiSummary = await buildAISummaryFromDB(category, weekOf);
    const agg = await computeWeeklyAggregate(category, weekOf);
    try {
      const enriched = await enrichWithLayerScores(agg, aiSummary);
      await storeEnrichedWeeklyAggregate(enriched);
    } catch (enrichErr) {
      // The aggregate ROW must exist even when enrichment fails (#567):
      // zero-document weeks are valid data ("absence is meaningful") and an
      // absent row renders as instrument-failure "No data" in the heatmap.
      // Store the bare count row, then surface the failure for retry.
      await storeWeeklyAggregate(agg);
      throw enrichErr;
    }
  } catch (err) {
    const msg = `Weekly aggregate failed for ${category}: ${formatError(err)}`;
    console.error(`[snapshot] ${msg}`);
    errors.push(msg);
    return { aggregateFailure: { category, weekOf }, errors };
  }

  return { aggregateFailure: null, errors };
}

export interface GroupLayerResult {
  /** Current-term weeks before the anchor that this call re-derived. */
  oldWeeks: string[];
  /** Baseline weeks reported (stored + scored, never derived by the cron). */
  baselineWeeks: string[];
}

/**
 * Run L2 + aggregate for every (category, week) group a fetch touched (#825).
 * Current-term groups re-derive their own week (anchor week last); baseline
 * groups are reported by name with the owner-run repair command — the cron
 * never writes baseline aggregates. Status flips on re-derived old weeks are
 * named on the error channel for a reversals-ledger entry; they do not hold
 * the digest.
 */
export async function runLayersForGroups(
  groups: CategoryWeekGroups,
  category: string,
  anchorWeekOf: string,
  errors: string[],
  failedAggregates: AggregateFailure[],
): Promise<GroupLayerResult> {
  const { current, baseline } = partitionGroupsByTerm(groups);
  const baselineWeeks = [...baseline.keys()].map((k) => parseCategoryWeekKey(k).weekOf);
  if (baselineWeeks.length > 0) {
    errors.push(
      describeBaselinePairs(
        `late-arrival L2/aggregate for ${category}`,
        baselineWeeks.map((weekOf) => ({ category, weekOf })),
      ),
    );
  }
  const ordered = orderKeysAnchorLast(current.keys(), anchorWeekOf);
  const oldWeeks = ordered
    .map((k) => parseCategoryWeekKey(k).weekOf)
    .filter((w) => w !== anchorWeekOf);
  const before = await captureOldWeekStatuses(oldWeeks);
  for (const key of ordered) {
    const { weekOf } = parseCategoryWeekKey(key);
    const result = await runLayersAndAggregate(current.get(key) ?? [], category, weekOf);
    errors.push(...result.errors);
    if (result.aggregateFailure) failedAggregates.push(result.aggregateFailure);
  }
  await reportLateArrivals(category, oldWeeks, current, before, errors);
  return { oldWeeks, baselineWeeks };
}

async function captureOldWeekStatuses(oldWeeks: string[]): Promise<StatusSnapshot | null> {
  if (oldWeeks.length === 0) return null;
  const sorted = [...oldWeeks].sort();
  return captureStatuses(sorted[0], sorted[sorted.length - 1]);
}

async function reportLateArrivals(
  category: string,
  oldWeeks: string[],
  groups: CategoryWeekGroups,
  before: StatusSnapshot | null,
  errors: string[],
): Promise<void> {
  if (oldWeeks.length === 0 || !before) return;
  const sorted = [...oldWeeks].sort();
  const items = oldWeeks.reduce(
    (n, w) => n + (groups.get(categoryWeekKey(category, w))?.length ?? 0),
    0,
  );
  console.log(
    `[snapshot]   late-arrival: ${category} re-derived ${oldWeeks.length} prior week(s) ` +
      `(${sorted.join(', ')}) from ${items} item(s); their narratives are now stale (G4h)`,
  );
  const after = await captureStatuses(sorted[0], sorted[sorted.length - 1]);
  const flips = lateArrivalFlips(diffStatuses(before, after), category, oldWeeks);
  if (flips.length === 0) return;
  errors.push(
    `late-arrival status flip(s) in ${category}: ` +
      flips.map((f) => `${f.weekOf}: ${f.from} → ${f.to}`).join('; ') +
      ' — add a reversals-ledger entry before the next release (not a digest hold)',
  );
}
