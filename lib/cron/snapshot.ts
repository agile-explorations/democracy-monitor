import { CATEGORIES } from '@/lib/data/categories';
import { getCurrentCycleYear, PRIMARY_BASELINE_CYCLE_YEAR } from '@/lib/methodology/scoring-config';
import { enhancedAssessment } from '@/lib/services/ai-assessment-service';
import { enhancedIntentAssessment } from '@/lib/services/ai-intent-service';
import type { CycleAdjustmentFactor } from '@/lib/services/cycle-adjustment-service';
import { loadCycleAdjustmentFactors } from '@/lib/services/cycle-adjustment-service';
import { enrichWithDeepAnalysis } from '@/lib/services/deep-analysis';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import {
  getDocumentsForWeek,
  getLastDocumentDate,
  storeDocuments,
} from '@/lib/services/document-store';
import { fetchCategoryFeedsWithMetadata } from '@/lib/services/feed-fetcher';
import { recordSnapshotSignalResults } from '@/lib/services/fetch-log-store';
import { fetchCategoryIncremental } from '@/lib/services/incremental-fetcher';
import {
  fetchAllRhetoricSources,
  statementsToContentItems,
} from '@/lib/services/intent-data-service';
import { saveIntentSnapshot } from '@/lib/services/intent-snapshot-store';
import { aggregateAllAreas } from '@/lib/services/intent-weekly-aggregator';
import { enrichWithLayerScores } from '@/lib/services/layer-scoring';
import { storeLegislativeItems } from '@/lib/services/legislative-dashboard-service';
import { fetchCongressionalRecord } from '@/lib/services/legislative-fetcher';
import { computeMetaAssessment } from '@/lib/services/meta-assessment-service';
import { generateNarrativesForWeek } from '@/lib/services/narrative-pipeline';
import { crossfeedRhetoricToCategories } from '@/lib/services/rhetoric-crossfeed';
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
import type { ContentItem } from '@/lib/types/assessment';
import { withCronLock } from '@/lib/utils/cron-lock';
import { addDays, getWeekRanges, toDateString } from '@/lib/utils/date-utils';

interface SnapshotOptions {
  from?: string;
  to?: string;
  category?: string;
}

/** Run Layer 2 AI assessment + weekly aggregate computation. */
async function runLayersAndAggregate(
  items: ContentItem[],
  category: string,
  weekOf: string,
): Promise<void> {
  let aiSummary: import('@/lib/types/structural').AIAssessmentSummary | null = null;
  try {
    const { runLayer2Assessment } = await import('@/lib/services/layer2-orchestrator');
    aiSummary = await runLayer2Assessment(items, category, weekOf);
    if (aiSummary) {
      console.log(
        `[snapshot]   Layer 2: ${aiSummary.flagCount}/${aiSummary.totalDocuments} flagged, ` +
          `concern rate ${(aiSummary.concernRate * 100).toFixed(1)}%`,
      );
    }
  } catch (err) {
    console.warn(`[snapshot] Layer 2 failed for ${category}:`, err);
  }

  try {
    const agg = await computeWeeklyAggregate(category, weekOf);
    const enriched = await enrichWithLayerScores(agg, aiSummary);
    await storeWeeklyAggregate(enriched);
  } catch (err) {
    console.error(`[snapshot] Weekly aggregate failed for ${category}:`, err);
  }
}

async function snapshotCategory(
  cat: (typeof CATEGORIES)[number],
  allHealthChecks: SourceHealthCheck[],
  cycleFactors?: Map<string, CycleAdjustmentFactor>,
): Promise<void> {
  const catStart = Date.now();
  console.log(`[snapshot] Fetching feeds for ${cat.key}...`);

  // Try incremental fetch (API signals from last stored date, RSS latest-N)
  const lastDate = await getLastDocumentDate(cat.key);
  let items: ContentItem[];
  let signalResults: import('@/lib/services/feed-fetcher').SignalFetchResult[];

  if (lastDate) {
    const result = await fetchCategoryIncremental(cat, lastDate);
    items = result.items;
    signalResults = result.signalResults;
    console.log(`[snapshot]   ${items.length} items fetched (incremental from ${lastDate})`);
  } else {
    // Fallback: no stored docs, use existing latest-N behavior
    const result = await fetchCategoryFeedsWithMetadata(cat);
    items = result.items;
    signalResults = result.signalResults;
    console.log(`[snapshot]   ${items.length} items fetched (${signalResults.length} signals)`);
  }

  const checks = await recordSourceHealthChecks(cat.key, signalResults);
  allHealthChecks.push(...checks);

  const weekStart = getWeekOfDate();
  recordSnapshotSignalResults(cat.key, weekStart, addDays(weekStart, 6), signalResults).catch(
    (err) => console.error(`[snapshot] fetch_log recording failed for ${cat.key}:`, err),
  );

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
  await runLayersAndAggregate(items, cat.key, weekOf);

  console.log(`[snapshot]   Done in ${Date.now() - catStart}ms`);
}

/** Run full assessment on a historical week (stages 6-9) using already-stored documents. */
async function snapshotCategoryWeek(
  cat: (typeof CATEGORIES)[number],
  week: { start: string; end: string },
  cycleFactors?: Map<string, CycleAdjustmentFactor>,
): Promise<boolean> {
  const items = await getDocumentsForWeek(cat.key, week.start, week.end);
  if (items.length === 0) return false;

  // Score + aggregate (stages 2-3, idempotent)
  const docScores = scoreDocumentBatch(items, cat.key);
  await storeDocumentScores(docScores);

  // Layer 2 + aggregate with layer scores (stages 7, 6/8/9 via enrichWithLayerScores)
  await runLayersAndAggregate(items, cat.key, week.start);

  // Keyword assessment + deep analysis + save snapshot (convergence output)
  const assessment = await enhancedAssessment(items, cat.key, { skipCache: true, cycleFactors });
  await enrichWithDeepAnalysis(assessment, items);
  await saveSnapshot(assessment);

  console.log(`  [${cat.key}] ${week.start}: ${items.length} docs, status=${assessment.status}`);
  return true;
}

/** Run historical snapshot across a date range for specified categories. */
async function runHistoricalSnapshots(options: SnapshotOptions): Promise<void> {
  const from = options.from!;
  const to = options.to || toDateString(new Date());
  const weeks = getWeekRanges(from, to);

  console.log(`[snapshot] Historical mode: ${from} → ${to} (${weeks.length} weeks)`);

  const cats = options.category ? CATEGORIES.filter((c) => c.key === options.category) : CATEGORIES;
  if (cats.length === 0) throw new Error(`Category "${options.category}" not found`);
  console.log(`[snapshot] ${cats.length} categories to process`);

  const cycleFactors = await loadCycleAdjustmentFactors(
    getCurrentCycleYear(),
    PRIMARY_BASELINE_CYCLE_YEAR,
  );

  let totalWeeks = 0;
  let totalEmpty = 0;

  for (const cat of cats) {
    console.log(`\n[snapshot] === ${cat.key} ===`);
    for (const week of weeks) {
      try {
        const hadDocs = await snapshotCategoryWeek(cat, week, cycleFactors);
        if (hadDocs) totalWeeks++;
        else totalEmpty++;
      } catch (err) {
        console.error(`  [${cat.key}] ${week.start} error:`, err);
      }
    }
  }

  // Generate narratives for all processed weeks
  for (const week of weeks) {
    try {
      await generateNarrativesForWeek(week.start);
    } catch (err) {
      console.error(`[snapshot] Narrative generation failed for ${week.start}:`, err);
    }
  }

  console.log(
    `\n[snapshot] Historical complete: ${totalWeeks} weeks assessed, ${totalEmpty} empty`,
  );
}

async function snapshotRhetoric(): Promise<void> {
  console.log('[snapshot] Fetching rhetoric sources for RAG storage...');
  try {
    const statements = await fetchAllRhetoricSources();
    const contentItems = statementsToContentItems(statements);
    const stored = await storeDocuments(contentItems, 'intent');
    const crossfed = await crossfeedRhetoricToCategories(contentItems);
    await embedUnprocessedDocuments(50);
    console.log(
      `[snapshot] Stored ${stored} rhetoric documents, cross-fed ${crossfed} to categories`,
    );

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

export async function runSnapshots(options: SnapshotOptions = {}): Promise<void> {
  if (options.from) {
    await runHistoricalSnapshots(options);
    return;
  }

  const start = Date.now();
  const cats = options.category ? CATEGORIES.filter((c) => c.key === options.category) : CATEGORIES;
  if (options.category && cats.length === 0) {
    throw new Error(`Category "${options.category}" not found`);
  }
  console.log(`[snapshot] Starting snapshot run for ${cats.length} categories...`);

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

  for (const cat of cats) {
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

  // Generate narratives for Elevated+ categories (after all aggregates are computed)
  try {
    const weekOf = getWeekOfDate();
    await generateNarrativesForWeek(weekOf);
  } catch (err) {
    console.error('[snapshot] Narrative generation failed:', err);
  }

  const elapsed = Date.now() - start;
  console.log(`[snapshot] Complete in ${elapsed}ms: ${succeeded} succeeded, ${failed} failed`);
}

function parseSnapshotArgs(args: string[]): SnapshotOptions {
  const opts: SnapshotOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--from') opts.from = args[++i];
    else if (arg === '--to') opts.to = args[++i];
    else if (arg === '--category') opts.category = args[++i];
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const opts = parseSnapshotArgs(process.argv.slice(2));
  withCronLock('snapshot', () => runSnapshots(opts))
    .then((ran) => process.exit(ran ? 0 : 0))
    .catch((err) => {
      console.error('[snapshot] Fatal error:', err);
      process.exit(1);
    });
}
