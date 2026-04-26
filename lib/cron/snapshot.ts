import { routeItemsToCategories } from '@/lib/cron/backfill-crec';
import { CATEGORIES } from '@/lib/data/categories';
import { enhancedIntentAssessment } from '@/lib/services/ai-intent-service';
import { fetchCpdHistorical } from '@/lib/services/cpd-fetcher';
import type { CpdDocument } from '@/lib/services/cpd-fetcher';
import { fetchCrecRecent } from '@/lib/services/crec-fetcher';
import { finishCronRun, startCronRun } from '@/lib/services/cron-run-store';
import type { CronRunStatus } from '@/lib/services/cron-run-store';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import {
  getDocumentsForWeek,
  getLastDocumentDateBySource,
  storeDocuments,
} from '@/lib/services/document-store';
import {
  markCategoryItemsStored,
  recordSnapshotSignalResults,
} from '@/lib/services/fetch-log-store';
import { fetchCategoryIncremental } from '@/lib/services/incremental-fetcher';
import {
  fetchAllRhetoricSources,
  statementsToContentItems,
} from '@/lib/services/intent-data-service';
import { saveIntentSnapshot } from '@/lib/services/intent-snapshot-store';
import { aggregateAllAreas } from '@/lib/services/intent-weekly-aggregator';
import { computeMetaAssessment } from '@/lib/services/meta-assessment-service';
import {
  generateNarrativesForWeek,
  retryFailedNarratives,
} from '@/lib/services/narrative-pipeline';
import type { SourceHealthCheck } from '@/lib/services/source-health-service';
import {
  computeHealthSummary,
  recordSourceHealthChecks,
} from '@/lib/services/source-health-service';
import {
  computeWeeklyAggregate,
  getLastCompletedWeek,
  getLatestAggregatedWeek,
  getWeekOfDate,
  getWeeksMissingNarratives,
  storeWeeklyAggregate,
} from '@/lib/services/weekly-aggregator';
import { enrichWithLayerScores } from '@/lib/services/weekly-enrichment';
import type { ContentItem } from '@/lib/types/assessment';
import { formatError } from '@/lib/utils/api-helpers';
import { checkHelp } from '@/lib/utils/cli-help';
import { withCronLock } from '@/lib/utils/cron-lock';
import { addDays, getWeekRanges, toDateString, weeksBetween } from '@/lib/utils/date-utils';

interface SnapshotOptions {
  from?: string;
  to?: string;
  category?: string;
  forceUnlock?: boolean;
}

export interface SnapshotResult {
  succeeded: number;
  failed: number;
  errors: string[];
}

interface AggregateFailure {
  category: string;
  weekOf: string;
}

/** Run Layer 2 AI assessment + weekly aggregate computation. Returns failure info if aggregate fails. */
async function runLayersAndAggregate(
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

async function snapshotCategory(
  cat: (typeof CATEGORIES)[number],
  allHealthChecks: SourceHealthCheck[],
  errors: string[],
  failedAggregates: AggregateFailure[],
): Promise<void> {
  const catStart = Date.now();
  console.log(`[snapshot] Fetching feeds for ${cat.key}...`);

  // Per-source incremental fetch — each source uses its own last-document date.
  // Only fetch through end of last completed week (Sunday).
  const completedWeekEnd = addDays(getLastCompletedWeek(), 6);
  const sourceDates = await getLastDocumentDateBySource(cat.key);
  const result = await fetchCategoryIncremental(cat, sourceDates, '2025-01-20', completedWeekEnd);
  const items: ContentItem[] = result.items;
  const signalResults: import('@/lib/services/feed-fetcher').SignalFetchResult[] =
    result.signalResults;
  console.log(`[snapshot]   ${items.length} items fetched (${signalResults.length} signals)`);

  // Enrich CL docket items with opinion text (uses bulk DB if available, else API)
  const clItems = items.filter((i) => i.type === 'court_opinion' && i.link);
  if (clItems.length > 0) {
    const { fillClOpinions } = await import('@/lib/cron/backfill-fetchers');
    await fillClOpinions(items);
    const opinions = items.filter((i) => i.type === 'judicial_opinion');
    console.log(
      `[snapshot]   ${opinions.length} CL opinions enriched from ${clItems.length} dockets`,
    );
  }

  const checks = await recordSourceHealthChecks(cat.key, signalResults);
  allHealthChecks.push(...checks);

  const weekStart = getWeekOfDate();
  try {
    await recordSnapshotSignalResults(cat.key, weekStart, addDays(weekStart, 6), signalResults);
  } catch (err) {
    const msg = `fetch_log recording failed for ${cat.key}: ${formatError(err)}`;
    console.error(`[snapshot] ${msg}`);
    errors.push(msg);
  }

  try {
    const stored = await storeDocuments(items, cat.key);
    const expected = items.filter((i) => !i.isError && !i.isWarning && i.link).length;
    if (stored < expected) {
      const msg = `Document storage incomplete for ${cat.key}: stored ${stored}/${expected}`;
      console.error(`[snapshot] ${msg}`);
      errors.push(msg);
    }
    await markCategoryItemsStored(cat.key, weekStart, stored).catch((err) =>
      console.warn(`[snapshot] fetch_log items_stored update failed for ${cat.key}:`, err),
    );
  } catch (err) {
    const msg = `RAG store failed for ${cat.key}: ${formatError(err)}`;
    console.error(`[snapshot] ${msg}`);
    errors.push(msg);
  }

  if (items.length > 0) {
    const docScores = scoreDocumentBatch(items, cat.key);
    try {
      await storeDocumentScores(docScores);
    } catch (err) {
      const msg = `Score storage failed for ${cat.key}: ${formatError(err)}`;
      console.error(`[snapshot] ${msg}`);
      errors.push(msg);
    }
    console.log(`[snapshot]   Scored ${docScores.length} documents`);
  }

  // Always aggregate — 0-document weeks create a valid aggregate row.
  // Only aggregate completed weeks (where Sunday has passed).
  const weekOf = getLastCompletedWeek();
  const layerResult = await runLayersAndAggregate(items, cat.key, weekOf);
  errors.push(...layerResult.errors);
  if (layerResult.aggregateFailure) failedAggregates.push(layerResult.aggregateFailure);

  console.log(`[snapshot]   Done in ${Date.now() - catStart}ms`);
}

/** Run scoring + Layer 2 + weekly aggregation for a historical week using stored documents. */
async function snapshotCategoryWeek(
  cat: (typeof CATEGORIES)[number],
  week: { start: string; end: string },
): Promise<boolean> {
  const items = await getDocumentsForWeek(cat.key, week.start, week.end);

  if (items.length > 0) {
    const docScores = scoreDocumentBatch(items, cat.key);
    await storeDocumentScores(docScores);
  }

  // Always create an aggregate — 0-document weeks are valid data (absence is meaningful)
  await runLayersAndAggregate(items, cat.key, week.start);

  if (items.length > 0) {
    console.log(`  [${cat.key}] ${week.start}: ${items.length} docs`);
  }
  return items.length > 0;
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

/** Store and score a single CPD document across its mapped categories. */
async function storeCpdDoc(doc: CpdDocument): Promise<number> {
  let stored = 0;
  for (const category of doc.categories) {
    stored += await storeDocuments([doc.item], category);
    await storeDocumentScores(scoreDocumentBatch([doc.item], category));
  }
  return stored;
}

/** Fetch presidential documents from GovInfo CPD for the completed week. */
async function snapshotCpd(): Promise<void> {
  console.log('[snapshot] Fetching CPD presidential documents...');
  const weekOf = getLastCompletedWeek();
  const weekEnd = addDays(weekOf, 6);
  try {
    const docs = await fetchCpdHistorical({
      dateFrom: weekOf,
      dateTo: weekEnd,
      fetchContent: true,
    });
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

    // Re-aggregate affected categories since CPD docs were added (with enrichment)
    for (const category of affectedCategories) {
      try {
        const { buildAISummaryFromDB } = await import('@/lib/services/document-review-summary');
        const aiSummary = await buildAISummaryFromDB(category, weekOf);
        const agg = await computeWeeklyAggregate(category, weekOf);
        const enriched = await enrichWithLayerScores(agg, aiSummary);
        await storeWeeklyAggregate(enriched);
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

/** Fetch recent CREC floor speeches, classify into categories, store + score. */
async function snapshotCrec(): Promise<void> {
  console.log('[snapshot] Fetching CREC (Congressional Record)...');
  const weekOf = getLastCompletedWeek();
  try {
    const items = await fetchCrecRecent({ chambers: ['SENATE', 'HOUSE'] });
    if (items.length === 0) {
      console.log('[snapshot] CREC: no new entries');
      return;
    }

    const routed = routeItemsToCategories(items);
    if (routed.length === 0) {
      console.log(`[snapshot] CREC: ${items.length} entries, 0 matched categories`);
      return;
    }

    let stored = 0;
    const affectedCategories = new Set<string>();
    for (const doc of routed) {
      for (const category of doc.categories) {
        stored += await storeDocuments([doc.item], category);
        await storeDocumentScores(scoreDocumentBatch([doc.item], category));
        affectedCategories.add(category);
      }
    }

    // Re-aggregate affected categories since CREC docs were added (with enrichment)
    for (const category of affectedCategories) {
      try {
        const { buildAISummaryFromDB } = await import('@/lib/services/document-review-summary');
        const aiSummary = await buildAISummaryFromDB(category, weekOf);
        const agg = await computeWeeklyAggregate(category, weekOf);
        const enriched = await enrichWithLayerScores(agg, aiSummary);
        await storeWeeklyAggregate(enriched);
      } catch (err) {
        console.error(`[snapshot] CREC re-aggregate failed for ${category}:`, err);
      }
    }

    console.log(
      `[snapshot] CREC: ${items.length} entries → ${routed.length} classified → ` +
        `${stored} rows across ${affectedCategories.size} categories`,
    );
  } catch (err) {
    console.error('[snapshot] CREC fetch failed:', err);
  }
}

/**
 * Find weeks (up to currentWeek exclusive) that are incomplete — missing
 * aggregates or narratives. Covers both missed snapshot runs AND partial
 * failures (e.g., aggregates created but narrative generation failed).
 */
async function findIncompleteWeeks(currentWeek: string): Promise<string[]> {
  // Weeks with aggregates but no overview narrative (partial failures)
  const missingNarratives = await getWeeksMissingNarratives(currentWeek);

  // Weeks between the latest aggregated week and current (fully missed runs)
  const latestWeek = await getLatestAggregatedWeek();
  const missingAggregates = latestWeek ? weeksBetween(latestWeek, currentWeek) : [];

  // Combine, deduplicate, sort chronologically
  const allWeeks = new Set([...missingNarratives, ...missingAggregates]);
  return [...allWeeks].sort();
}

/**
 * Process incomplete weeks: score + aggregate if needed, then generate narratives.
 * Handles both fully missed weeks and partial failures (aggregates OK, narratives missing).
 */
async function processIncompleteWeeks(
  weeks: string[],
  cats: (typeof CATEGORIES)[number][],
): Promise<void> {
  console.log(`[snapshot] Processing ${weeks.length} incomplete week(s): ${weeks.join(', ')}`);

  for (const weekStart of weeks) {
    const weekEnd = addDays(weekStart, 6);

    // Score + aggregate (idempotent — upserts on conflict)
    for (const cat of cats) {
      try {
        await snapshotCategoryWeek(cat, { start: weekStart, end: weekEnd });
      } catch (err) {
        console.error(`  [${cat.key}] ${weekStart} error:`, err);
      }
    }

    // Generate narratives (skips categories that already have them)
    try {
      await generateNarrativesForWeek(weekStart);
    } catch (err) {
      console.error(`[snapshot] Narrative generation failed for ${weekStart}:`, err);
    }
  }
}

/** Send weekly digest email to subscribers (non-fatal — errors appended but don't fail snapshot). */
async function trySendWeeklyDigest(weekOf: string, errors: string[]): Promise<void> {
  try {
    const { sendWeeklyDigest } = await import('@/lib/services/subscriber-service');
    const sent = await sendWeeklyDigest(weekOf);
    if (sent > 0) console.log(`[snapshot] Weekly digest sent to ${sent} subscribers`);
  } catch (err) {
    errors.push(`Weekly digest failed: ${formatError(err)}`);
  }
}

/** Retry aggregate failures, embed docs, process missed weeks, generate + retry narratives. */
async function runPostCategorySteps(
  cats: (typeof CATEGORIES)[number][],
  failedAggregates: AggregateFailure[],
  allHealthChecks: SourceHealthCheck[],
  errors: string[],
): Promise<{
  aggregateRetries: number;
  embeddingsProcessed: number;
  missedWeeks: number;
  missedWeeksProcessed: number;
  narrativesGenerated: boolean;
}> {
  // Retry failed weekly aggregates once (transient DB errors)
  let aggregateRetries = 0;
  for (const { category, weekOf } of failedAggregates) {
    try {
      const agg = await computeWeeklyAggregate(category, weekOf);
      await storeWeeklyAggregate(agg);
      aggregateRetries++;
      console.log(`[snapshot] Retry succeeded for ${category}/${weekOf}`);
    } catch (err) {
      errors.push(`Aggregate retry failed for ${category}/${weekOf}: ${formatError(err)}`);
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
  await snapshotCrec();
  await snapshotRhetoric();

  // Opinion-first CL pass: find opinions issued this week for ANY matching docket
  const { tryOpinionFirstPass } = await import('@/lib/services/cl-bulk-staging');
  await tryOpinionFirstPass(getLastCompletedWeek(), addDays(getLastCompletedWeek(), 6), false);

  let embeddingsProcessed = 0;
  try {
    embeddingsProcessed = await embedUnprocessedDocuments(100);
    if (embeddingsProcessed > 0)
      console.log(`[snapshot] Embedded ${embeddingsProcessed} documents`);
  } catch (err) {
    errors.push(`Embedding failed: ${formatError(err)}`);
  }

  const currentWeek = getLastCompletedWeek();
  console.log(`[snapshot] Processing completed week: ${currentWeek}`);
  let incompleteWeeksList: string[] = [];
  try {
    incompleteWeeksList = await findIncompleteWeeks(currentWeek);
  } catch (err) {
    errors.push(`Incomplete weeks detection failed: ${formatError(err)}`);
  }
  let missedWeeksProcessed = 0;
  if (incompleteWeeksList.length > 0) {
    await processIncompleteWeeks(incompleteWeeksList, cats);
    missedWeeksProcessed = incompleteWeeksList.length;
  }

  let narrativesGenerated = false;
  try {
    await generateNarrativesForWeek(currentWeek);
    narrativesGenerated = true;
  } catch (err) {
    errors.push(`Narrative generation failed: ${formatError(err)}`);
  }

  try {
    const { resolved: retried } = await retryFailedNarratives(currentWeek);
    if (retried > 0) console.log(`[snapshot] Retried ${retried} failed narratives`);
  } catch (err) {
    console.warn('[snapshot] Narrative retry failed:', err);
  }

  if (narrativesGenerated) {
    await trySendWeeklyDigest(currentWeek, errors);
  }

  return {
    aggregateRetries,
    embeddingsProcessed,
    missedWeeks: incompleteWeeksList.length,
    missedWeeksProcessed,
    narrativesGenerated,
  };
}

export async function runSnapshots(options: SnapshotOptions = {}): Promise<SnapshotResult> {
  if (options.from) {
    await runHistoricalSnapshots(options);
    return { succeeded: 0, failed: 0, errors: [] };
  }

  const cronRunId = await startCronRun('snapshot');
  const start = Date.now();
  const cats = options.category ? CATEGORIES.filter((c) => c.key === options.category) : CATEGORIES;
  if (options.category && cats.length === 0) {
    throw new Error(`Category "${options.category}" not found`);
  }
  console.log(`[snapshot] Starting snapshot run for ${cats.length} categories...`);

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  const allHealthChecks: SourceHealthCheck[] = [];
  const failedAggregates: AggregateFailure[] = [];

  for (const cat of cats) {
    try {
      await snapshotCategory(cat, allHealthChecks, errors, failedAggregates);
      succeeded++;
    } catch (err) {
      failed++;
      const msg = `Category ${cat.key} failed: ${formatError(err)}`;
      console.error(`[snapshot] ${msg}`);
      errors.push(msg);
    }
  }

  const post = await runPostCategorySteps(cats, failedAggregates, allHealthChecks, errors);

  const elapsed = Date.now() - start;
  console.log(`[snapshot] Complete in ${elapsed}ms: ${succeeded} succeeded, ${failed} failed`);

  let status: CronRunStatus = 'success';
  if (failed > succeeded) status = 'failed';
  else if (failed > 0 || errors.length > 0) status = 'partial';

  await finishCronRun(cronRunId, status, { succeeded, failed, ...post }, errors);

  return { succeeded, failed, errors };
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

/** Validate that required environment variables are set. Exits with error if not. */
function validateEnvVars(): void {
  const required = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
  const optional = ['GOVINFO_API_KEY', 'COURTLISTENER_API_TOKEN', 'FEC_API_KEY'];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[snapshot] FATAL: Missing required env vars: ${missing.join(', ')}`);
    console.error('[snapshot] L2 assessment and narrative generation require these keys.');
    process.exit(1);
  }

  const missingOptional = optional.filter((k) => !process.env[k]);
  if (missingOptional.length > 0) {
    console.warn(`[snapshot] Warning: Missing optional env vars: ${missingOptional.join(', ')}`);
    console.warn('[snapshot] Some data sources will be skipped.');
  }
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
  validateEnvVars();
  const opts = parseSnapshotArgs(argv);
  let snapshotResult: SnapshotResult | undefined;
  withCronLock(
    'snapshot',
    async () => {
      snapshotResult = await runSnapshots(opts);
    },
    undefined,
    opts.forceUnlock,
  )
    .then((ran) => {
      if (!ran) process.exit(2); // lock held → skipped
      process.exit(snapshotResult && snapshotResult.failed > snapshotResult.succeeded ? 1 : 0);
    })
    .catch((err) => {
      console.error('[snapshot] Fatal error:', err);
      process.exit(1);
    });
}
