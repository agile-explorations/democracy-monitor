import { fetchWeekDocuments } from '@/lib/cron/backfill-fetchers';
import type { WeekFetchResult } from '@/lib/cron/backfill-fetchers';
import { backfillRhetoricWithAggregation } from '@/lib/cron/backfill-rhetoric';
import { CATEGORIES } from '@/lib/data/categories';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { getDocumentsForWeek, storeDocuments } from '@/lib/services/document-store';
import { getCompletedWeekStarts, recordWeekFetchResults } from '@/lib/services/fetch-log-store';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';
import { sleep } from '@/lib/utils/async';
import { getWeekRanges, toDateString } from '@/lib/utils/date-utils';

const INAUGURATION_DATE = '2025-01-20';
const EMBED_BATCH_SIZE = 50;

interface BackfillOptions {
  from?: string;
  to?: string;
  category?: string;
  dryRun?: boolean;
  source?: string;
}

const SOURCE_TO_SIGNAL_TYPE: Record<string, string> = {
  courtlistener: 'courtlistener',
  doj: 'doj_json',
  govinfo: 'govinfo',
  fec: 'fec_json',
  fr: 'federal_register',
};

type Signal = { url: string; type: string };
type SignalGroups = { fr: Signal[]; cl: Signal[]; doj: Signal[]; gi: Signal[]; fec: Signal[] };

const SIGNAL_TYPE_TO_GROUP_KEY: Record<string, keyof SignalGroups> = {
  courtlistener: 'cl',
  doj_json: 'doj',
  govinfo: 'gi',
  fec_json: 'fec',
  federal_register: 'fr',
};

/** Fetch, store, score, aggregate, and embed a week's documents. */
async function processWeek(
  week: { start: string; end: string },
  signalGroups: SignalGroups,
  categoryKey: string,
  skipIngest: boolean,
): Promise<{ docs: number; fetchResult: WeekFetchResult | null }> {
  let items: ContentItem[];
  let stored = 0;
  let fetchResult: WeekFetchResult | null = null;

  if (skipIngest) {
    items = await getDocumentsForWeek(categoryKey, week.start, week.end);
  } else {
    fetchResult = await fetchWeekDocuments(week, signalGroups, categoryKey);
    items = fetchResult.items;
    if (items.length > 0) {
      stored = await storeDocuments(items, categoryKey);
    }
  }

  if (items.length > 0) {
    await storeDocumentScores(scoreDocumentBatch(items, categoryKey));
    await storeWeeklyAggregate(await computeWeeklyAggregate(categoryKey, week.start));
  }

  const label = skipIngest ? 'reprocessed' : 'ingested';
  console.log(`  [${categoryKey}] ${week.start} → ${week.end}: ${items.length} docs (${label})`);
  await sleep(500);
  return { docs: stored, fetchResult };
}

/** Run processWeek with error handling. */
async function runWeek(
  week: { start: string; end: string },
  signalGroups: SignalGroups,
  categoryKey: string,
  skipIngest: boolean,
): Promise<{ docs: number; fetchResult: WeekFetchResult | null }> {
  try {
    return await processWeek(week, signalGroups, categoryKey, skipIngest);
  } catch (err) {
    console.error(`  [${categoryKey}] ${week.start} processing error: ${formatError(err)}`);
    return { docs: 0, fetchResult: null };
  }
}

function buildSignalGroups(signals: Signal[], sourceSignalType?: string): SignalGroups {
  const groups: SignalGroups = {
    fr: signals.filter((s) => s.type === 'federal_register'),
    cl: signals.filter((s) => s.type === 'courtlistener'),
    doj: signals.filter((s) => s.type === 'doj_json'),
    gi: signals.filter((s) => s.type === 'govinfo'),
    fec: signals.filter((s) => s.type === 'fec_json'),
  };
  if (sourceSignalType) {
    const keepKey = SIGNAL_TYPE_TO_GROUP_KEY[sourceSignalType];
    for (const key of Object.keys(groups) as Array<keyof SignalGroups>) {
      if (key !== keepKey) groups[key] = [];
    }
  }
  return groups;
}

/** Classify a week result as complete/partial/failed and record to fetch_log. */
async function recordAndClassify(
  categoryKey: string,
  week: { start: string; end: string },
  fetchResult: WeekFetchResult | null,
  storedDocs: number,
): Promise<'complete' | 'partial' | 'failed' | 'skipped'> {
  if (!fetchResult) return 'skipped';
  await recordWeekFetchResults(
    categoryKey,
    week.start,
    week.end,
    fetchResult.sourceResults,
    storedDocs,
  );
  const hasErrors = Object.values(fetchResult.sourceResults).some((r) => r.errors.length > 0);
  if (hasErrors && fetchResult.items.length === 0) return 'failed';
  if (hasErrors) return 'partial';
  return 'complete';
}

async function backfillCategory(
  categoryKey: string,
  signals: Signal[],
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
  sourceSignalType?: string,
): Promise<{ docs: number; apiCalls: number }> {
  const signalGroups = buildSignalGroups(signals, sourceSignalType);
  const totalSignals = Object.values(signalGroups).reduce((sum, g) => sum + g.length, 0);
  if (totalSignals === 0) {
    console.log(`  [${categoryKey}] No fetchable signals — skipping`);
    return { docs: 0, apiCalls: 0 };
  }

  const sourceOrigin = sourceSignalType?.replace('_json', '');
  const completedWeeks = sourceOrigin
    ? await getCompletedWeekStarts(sourceOrigin, categoryKey)
    : new Set<string>();
  let totalDocs = 0;
  let reprocessed = 0;
  const counts = { complete: 0, partial: 0, failed: 0, skipped: 0 };

  for (const week of weeks) {
    if (dryRun) continue;
    const skipIngest = !!(sourceOrigin && completedWeeks.has(week.start));
    if (skipIngest) reprocessed++;

    const result = await runWeek(week, signalGroups, categoryKey, skipIngest);
    totalDocs += result.docs;
    counts[await recordAndClassify(categoryKey, week, result.fetchResult, result.docs)]++;
  }

  // Embed unprocessed documents for this category after all weeks
  try {
    const embedded = await embedUnprocessedDocuments(EMBED_BATCH_SIZE, categoryKey);
    if (embedded > 0) console.log(`  [${categoryKey}] Embedded ${embedded} documents`);
  } catch (err) {
    console.warn(`  [${categoryKey}] Embedding skipped: ${formatError(err)}`);
  }

  if (reprocessed > 0) {
    console.log(`  [${categoryKey}] Reprocessed ${reprocessed} weeks (ingest skipped)`);
  }
  const processed = counts.complete + counts.partial + counts.failed;
  if (processed > 0) {
    console.log(
      `  [${categoryKey}] ${counts.complete} complete, ${counts.partial} partial, ${counts.failed} failed`,
    );
  }
  return { docs: totalDocs, apiCalls: weeks.length * totalSignals };
}

function resolveSourceFilter(source?: string): string | undefined {
  if (!source) return undefined;
  const signalType = SOURCE_TO_SIGNAL_TYPE[source];
  if (!signalType) {
    const valid = Object.keys(SOURCE_TO_SIGNAL_TYPE).join(', ');
    throw new Error(`Unknown source: ${source}. Valid: ${valid}`);
  }
  return signalType;
}

export async function runBackfill(options: BackfillOptions = {}): Promise<void> {
  const from = options.from || INAUGURATION_DATE;
  const to = options.to || toDateString(new Date());
  const dryRun = options.dryRun || false;
  const sourceSignalType = resolveSourceFilter(options.source);

  console.log(`[backfill] ${dryRun ? '(DRY RUN) ' : ''}Range: ${from} → ${to}`);
  if (options.source)
    console.log(`[backfill] Source filter: ${options.source} (${sourceSignalType})`);

  const weeks = getWeekRanges(from, to);
  console.log(`[backfill] ${weeks.length} weeks to process`);

  const cats = options.category ? CATEGORIES.filter((c) => c.key === options.category) : CATEGORIES;
  if (cats.length === 0) throw new Error(`Category "${options.category}" not found`);
  console.log(`[backfill] ${cats.length} categories to process`);

  let totalDocs = 0;
  let totalApiCalls = 0;

  for (const cat of cats) {
    console.log(`\n[backfill] === ${cat.key} (${cat.signals.length} signals) ===`);
    const r = await backfillCategory(cat.key, cat.signals, weeks, dryRun, sourceSignalType);
    totalDocs += r.docs;
    totalApiCalls += r.apiCalls;
  }

  if (!options.source && !options.category) {
    totalDocs += await backfillRhetoricWithAggregation(weeks, dryRun);
  }

  console.log(`\n[backfill] === Summary ===`);
  console.log(`  API calls: ${dryRun ? `~${totalApiCalls} (estimated)` : totalApiCalls}`);
  console.log(`  Documents stored: ${totalDocs}`);
}

function parseCliArgs(args: string[]): BackfillOptions {
  const opts: BackfillOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--from') opts.from = args[++i];
    else if (arg === '--to') opts.to = args[++i];
    else if (arg === '--category') opts.category = args[++i];
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--source') opts.source = args[++i];
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  runBackfill(parseCliArgs(process.argv.slice(2)))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill] Fatal error:', err);
      process.exit(1);
    });
}
