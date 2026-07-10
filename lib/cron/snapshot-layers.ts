/**
 * Per-category-week layer processing for the snapshot pipeline: L2 assessment,
 * decoupled actor attribution (#537), and weekly aggregate build/enrich/store.
 * Extracted from snapshot.ts (max-lines).
 */

import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
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
    const enriched = await enrichWithLayerScores(agg, aiSummary);
    await storeWeeklyAggregate(enriched);
  } catch (err) {
    const msg = `Weekly aggregate failed for ${category}: ${formatError(err)}`;
    console.error(`[snapshot] ${msg}`);
    errors.push(msg);
    return { aggregateFailure: { category, weekOf }, errors };
  }

  return { aggregateFailure: null, errors };
}
