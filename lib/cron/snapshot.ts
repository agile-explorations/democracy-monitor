import { CATEGORIES } from '@/lib/data/categories';
import { enhancedIntentAssessment } from '@/lib/services/ai-intent-service';
import { fetchCpdHistorical } from '@/lib/services/cpd-fetcher';
import type { CpdDocument } from '@/lib/services/cpd-fetcher';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import {
  getDocumentsForWeek,
  getLastDocumentDateBySource,
  storeDocuments,
} from '@/lib/services/document-store';
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
import { checkHelp } from '@/lib/utils/cli-help';
import { withCronLock } from '@/lib/utils/cron-lock';
import { addDays, getWeekRanges, toDateString } from '@/lib/utils/date-utils';

interface SnapshotOptions {
  from?: string;
  to?: string;
  category?: string;
  forceUnlock?: boolean;
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
): Promise<void> {
  const catStart = Date.now();
  console.log(`[snapshot] Fetching feeds for ${cat.key}...`);

  // Per-source incremental fetch — each source uses its own last-document date
  const sourceDates = await getLastDocumentDateBySource(cat.key);
  const result = await fetchCategoryIncremental(cat, sourceDates, '2025-01-20');
  const items: ContentItem[] = result.items;
  const signalResults: import('@/lib/services/feed-fetcher').SignalFetchResult[] =
    result.signalResults;
  console.log(`[snapshot]   ${items.length} items fetched (${signalResults.length} signals)`);

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
    console.log(`[snapshot]   Skipping (no items)`);
    return;
  }

  const docScores = scoreDocumentBatch(items, cat.key);
  storeDocumentScores(docScores).catch((err) =>
    console.error(`[snapshot] Score storage failed for ${cat.key}:`, err),
  );
  console.log(`[snapshot]   Scored ${docScores.length} documents`);

  const weekOf = getWeekOfDate();
  await runLayersAndAggregate(items, cat.key, weekOf);

  console.log(`[snapshot]   Done in ${Date.now() - catStart}ms`);
}

/** Run scoring + Layer 2 + weekly aggregation for a historical week using stored documents. */
async function snapshotCategoryWeek(
  cat: (typeof CATEGORIES)[number],
  week: { start: string; end: string },
): Promise<boolean> {
  const items = await getDocumentsForWeek(cat.key, week.start, week.end);
  if (items.length === 0) return false;

  const docScores = scoreDocumentBatch(items, cat.key);
  await storeDocumentScores(docScores);

  await runLayersAndAggregate(items, cat.key, week.start);

  console.log(`  [${cat.key}] ${week.start}: ${items.length} docs`);
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

  let totalWeeks = 0;
  let totalEmpty = 0;

  for (const cat of cats) {
    console.log(`\n[snapshot] === ${cat.key} ===`);
    for (const week of weeks) {
      try {
        const hadDocs = await snapshotCategoryWeek(cat, week);
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

/** Store and score a single CPD document across its mapped categories. */
async function storeCpdDoc(doc: CpdDocument): Promise<number> {
  let stored = 0;
  for (const category of doc.categories) {
    stored += await storeDocuments([doc.item], category);
    await storeDocumentScores(scoreDocumentBatch([doc.item], category));
  }
  return stored;
}

/** Fetch presidential documents from GovInfo CPD for the current week. */
async function snapshotCpd(): Promise<void> {
  console.log('[snapshot] Fetching CPD presidential documents...');
  const weekOf = getWeekOfDate();
  const today = toDateString(new Date());
  try {
    const docs = await fetchCpdHistorical({ dateFrom: weekOf, dateTo: today, fetchContent: true });
    if (docs.length === 0) {
      console.log('[snapshot] CPD: no new documents');
      return;
    }

    let stored = 0;
    const affectedCategories = new Set<string>();
    for (const doc of docs) {
      stored += await storeCpdDoc(doc);
      doc.categories.forEach((c) => affectedCategories.add(c));
    }

    // Re-aggregate affected categories since CPD docs were added
    for (const category of affectedCategories) {
      try {
        const agg = await computeWeeklyAggregate(category, weekOf);
        await storeWeeklyAggregate(agg);
      } catch (err) {
        console.error(`[snapshot] CPD re-aggregate failed for ${category}:`, err);
      }
    }

    console.log(
      `[snapshot] CPD: ${docs.length} documents → ${stored} rows across ${affectedCategories.size} categories`,
    );
  } catch (err) {
    console.error('[snapshot] CPD fetch failed:', err);
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

  let succeeded = 0;
  let failed = 0;
  const allHealthChecks: SourceHealthCheck[] = [];

  for (const cat of cats) {
    try {
      await snapshotCategory(cat, allHealthChecks);
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

  await snapshotCpd();
  await snapshotRhetoric();
  await snapshotLegislative();

  // Embed unprocessed documents across all categories (feeds Layer 3 thematic drift)
  try {
    const embedded = await embedUnprocessedDocuments(100);
    if (embedded > 0) console.log(`[snapshot] Embedded ${embedded} documents`);
  } catch (err) {
    console.warn('[snapshot] Embedding failed:', err);
  }

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
    else if (arg === '--force-unlock') opts.forceUnlock = true;
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm snapshot [options]

Options:
  --from <date>       Start date (YYYY-MM-DD), default: current week
  --to <date>         End date (YYYY-MM-DD), default: today
  --category <key>    Process a single category
  --force-unlock      Clear stale cron lock before running`,
  );
  const opts = parseSnapshotArgs(argv);
  withCronLock('snapshot', () => runSnapshots(opts), undefined, opts.forceUnlock)
    .then((ran) => process.exit(ran ? 0 : 0))
    .catch((err) => {
      console.error('[snapshot] Fatal error:', err);
      process.exit(1);
    });
}
