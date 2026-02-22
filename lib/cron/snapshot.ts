import { CATEGORIES } from '@/lib/data/categories';
import {
  PRIMARY_BASELINE_ID,
  getCurrentCycleYear,
  PRIMARY_BASELINE_CYCLE_YEAR,
} from '@/lib/methodology/scoring-config';
import { enhancedAssessment } from '@/lib/services/ai-assessment-service';
import { enhancedIntentAssessment } from '@/lib/services/ai-intent-service';
import { extractWeekMetadata } from '@/lib/services/baseline-distributions';
import { getBaseline } from '@/lib/services/baseline-service';
import { synthesizeConvergence } from '@/lib/services/convergence-synthesis';
import type { CycleAdjustmentFactor } from '@/lib/services/cycle-adjustment-service';
import { loadCycleAdjustmentFactors } from '@/lib/services/cycle-adjustment-service';
import { enrichWithDeepAnalysis } from '@/lib/services/deep-analysis';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import { fetchCategoryFeedsWithMetadata } from '@/lib/services/feed-fetcher';
import {
  fetchAllRhetoricSources,
  statementsToContentItems,
} from '@/lib/services/intent-data-service';
import { saveIntentSnapshot } from '@/lib/services/intent-snapshot-store';
import { aggregateAllAreas } from '@/lib/services/intent-weekly-aggregator';
import { storeLegislativeItems } from '@/lib/services/legislative-dashboard-service';
import { fetchCongressionalRecord } from '@/lib/services/legislative-fetcher';
import { computeMetaAssessment } from '@/lib/services/meta-assessment-service';
import { computeRollingThematicDrift } from '@/lib/services/semantic-drift-service';
import { saveSnapshot } from '@/lib/services/snapshot-store';
import type { SourceHealthCheck } from '@/lib/services/source-health-service';
import {
  computeHealthSummary,
  recordSourceHealthChecks,
} from '@/lib/services/source-health-service';
import {
  computeWeeklyAggregate,
  getWeekOfDate,
  storeWeeklyAggregate,
} from '@/lib/services/weekly-aggregator';
import type { WeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { toDateString } from '@/lib/utils/date-utils';

async function snapshotCategory(
  cat: (typeof CATEGORIES)[number],
  allHealthChecks: SourceHealthCheck[],
  cycleFactors?: Map<string, CycleAdjustmentFactor>,
): Promise<void> {
  const catStart = Date.now();
  console.log(`[snapshot] Fetching feeds for ${cat.key}...`);
  const { items, signalResults } = await fetchCategoryFeedsWithMetadata(cat);
  console.log(`[snapshot]   ${items.length} items fetched (${signalResults.length} signals)`);

  const checks = await recordSourceHealthChecks(cat.key, signalResults);
  allHealthChecks.push(...checks);

  storeDocuments(items, cat.key).catch((err) =>
    console.error(`[snapshot] RAG store failed for ${cat.key}:`, err),
  );

  if (items.length === 0) {
    console.log(`[snapshot]   Skipping assessment (no items)`);
    return;
  }

  console.log(`[snapshot] Running assessment for ${cat.key}...`);
  const assessment = await enhancedAssessment(items, cat.key, { skipCache: true, cycleFactors });

  console.log(`[snapshot] Running deep analysis for ${cat.key}...`);
  await enrichWithDeepAnalysis(assessment, items);

  console.log(`[snapshot] Saving snapshot for ${cat.key}: ${assessment.status}`);
  await saveSnapshot(assessment);

  const docScores = scoreDocumentBatch(items, cat.key);
  storeDocumentScores(docScores).catch((err) =>
    console.error(`[snapshot] Score storage failed for ${cat.key}:`, err),
  );
  console.log(`[snapshot]   Scored ${docScores.length} documents`);

  const weekOf = getWeekOfDate();
  computeWeeklyAggregate(cat.key, weekOf)
    .then((agg) => enrichWithLayerScores(agg))
    .then((agg) => storeWeeklyAggregate(agg))
    .catch((err) => console.error(`[snapshot] Weekly aggregate failed for ${cat.key}:`, err));

  console.log(`[snapshot]   Done in ${Date.now() - catStart}ms`);
}

/**
 * Enrich a weekly aggregate with Layer 1 (structural) and Layer 3 (thematic) scores,
 * plus the partial convergence synthesis.
 */
async function enrichWithLayerScores(agg: WeeklyAggregate): Promise<WeeklyAggregate> {
  try {
    const [structural, thematic] = await Promise.all([
      computeStructuralLayer(agg.category, agg.weekOf),
      computeRollingThematicDrift(agg.category, agg.weekOf),
    ]);

    const convergence = synthesizeConvergence(structural, thematic);

    return {
      ...agg,
      structuralScore: structural?.composite ?? undefined,
      structuralDetail: structural ?? undefined,
      thematicScore: thematic?.zScore ?? undefined,
      thematicDetail: thematic ?? undefined,
      convergenceScore: convergence.layersElevated,
      convergenceDetail: convergence,
    };
  } catch (err) {
    console.warn(`[snapshot] Layer scoring failed for ${agg.category}/${agg.weekOf}:`, err);
    return agg;
  }
}

async function computeStructuralLayer(
  category: string,
  weekOf: string,
): Promise<import('@/lib/types/structural').StructuralScore | null> {
  const { computeStructuralScore } = await import('@/lib/services/structural-anomaly-service');
  const { computeBaselineStructuralDistribution } =
    await import('@/lib/services/baseline-distributions');
  const { BASELINE_CONFIGS } = await import('@/lib/data/baselines');

  const weekMetadata = await extractWeekMetadata(category, weekOf);
  if (!weekMetadata) return null;

  const primaryConfig = BASELINE_CONFIGS.find((c) => c.id === PRIMARY_BASELINE_ID);
  if (!primaryConfig) return null;

  const baselineDistribution = await computeBaselineStructuralDistribution(primaryConfig, category);
  if (!baselineDistribution) return null;

  return computeStructuralScore(weekMetadata, baselineDistribution);
}

async function snapshotRhetoric(): Promise<void> {
  console.log('[snapshot] Fetching rhetoric sources for RAG storage...');
  try {
    const statements = await fetchAllRhetoricSources();
    const contentItems = statementsToContentItems(statements);
    const stored = await storeDocuments(contentItems, 'intent');
    await embedUnprocessedDocuments(50);
    console.log(`[snapshot] Stored ${stored} rhetoric documents`);

    console.log('[snapshot] Running intent assessment...');
    try {
      const intentResult = await enhancedIntentAssessment(statements, { skipCache: true });
      await saveIntentSnapshot(intentResult);
      console.log(`[snapshot] Intent assessment saved: ${intentResult.overall}`);
    } catch (intentErr) {
      console.error('[snapshot] Intent assessment failed:', intentErr);
    }

    aggregateAllAreas().catch((err) =>
      console.error('[snapshot] Intent weekly aggregation failed:', err),
    );
  } catch (err) {
    console.error('[snapshot] Rhetoric RAG storage failed:', err);
  }
}

async function snapshotLegislative(): Promise<void> {
  console.log('[snapshot] Fetching congressional record data...');
  const today = toDateString(new Date());
  try {
    const legislativeItems = await fetchCongressionalRecord({ dateFrom: today, dateTo: today });
    console.log(`[snapshot] Fetched ${legislativeItems.length} legislative items`);
    await storeLegislativeItems(legislativeItems);
  } catch (err) {
    console.error('[snapshot] Legislative fetch failed:', err);
  }
}

export async function runSnapshots(): Promise<void> {
  const start = Date.now();
  console.log(`[snapshot] Starting snapshot run for ${CATEGORIES.length} categories...`);

  const cycleFactors = await loadCycleAdjustmentFactors(
    getCurrentCycleYear(),
    PRIMARY_BASELINE_CYCLE_YEAR,
  );
  if (cycleFactors.size > 0) {
    console.log(`[snapshot] Loaded ${cycleFactors.size} cycle adjustment factors`);
  }

  let succeeded = 0;
  let failed = 0;
  const allHealthChecks: SourceHealthCheck[] = [];

  for (const cat of CATEGORIES) {
    try {
      await snapshotCategory(cat, allHealthChecks, cycleFactors);
      succeeded++;
    } catch (err) {
      failed++;
      console.error(`[snapshot] Error processing ${cat.key}:`, err);
    }
  }

  if (allHealthChecks.length > 0) {
    const summary = computeHealthSummary(allHealthChecks);
    const meta = computeMetaAssessment(summary, allHealthChecks);
    console.log(
      `[snapshot] Source health: ${meta.dataIntegrity} (${summary.healthySources}/${summary.totalSources} healthy)`,
    );
  }

  await snapshotRhetoric();
  await snapshotLegislative();

  const elapsed = Date.now() - start;
  console.log(`[snapshot] Complete in ${elapsed}ms: ${succeeded} succeeded, ${failed} failed`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  runSnapshots()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[snapshot] Fatal error:', err);
      process.exit(1);
    });
}
