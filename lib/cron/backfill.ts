import { assessWeek } from '@/lib/cron/assess-week';
import type { AiOptions } from '@/lib/cron/assess-week';
import { fetchWeekDocuments } from '@/lib/cron/backfill-fetchers';
import type { WeekFetchResult } from '@/lib/cron/backfill-fetchers';
import { backfillRhetoricWithAggregation } from '@/lib/cron/backfill-rhetoric';
import { CATEGORIES } from '@/lib/data/categories';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import { getCompletedWeekStarts, recordWeekFetchResults } from '@/lib/services/fetch-log-store';
import { saveSnapshot } from '@/lib/services/snapshot-store';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { formatError } from '@/lib/utils/api-helpers';
import { sleep } from '@/lib/utils/async';
import { getWeekRanges, toDateString } from '@/lib/utils/date-utils';

const INAUGURATION_DATE = '2025-01-20';

interface BackfillOptions {
  from?: string;
  to?: string;
  category?: string;
  dryRun?: boolean;
  includeRhetoric?: boolean;
  skipAi?: boolean;
  model?: string;
  source?: string;
  ingestOnly?: boolean;
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

/** Fetch, store, and score a week's documents (no assessment/aggregation). */
async function ingestWeek(
  week: { start: string; end: string },
  signalGroups: SignalGroups,
  categoryKey: string,
): Promise<{ docs: number; fetchResult: WeekFetchResult }> {
  const fetchResult = await fetchWeekDocuments(week, signalGroups, categoryKey);
  if (fetchResult.items.length === 0) return { docs: 0, fetchResult };

  const stored = await storeDocuments(fetchResult.items, categoryKey);
  await storeDocumentScores(scoreDocumentBatch(fetchResult.items, categoryKey));

  console.log(
    `  [${categoryKey}] ${week.start} → ${week.end}: ${fetchResult.items.length} docs (ingest-only)`,
  );
  await sleep(500);
  return { docs: stored, fetchResult };
}

/** Fetch, store, score, assess, and aggregate a week's documents. */
async function processWeek(
  week: { start: string; end: string },
  signalGroups: SignalGroups,
  categoryKey: string,
  aiOptions: AiOptions,
): Promise<{ docs: number; snapshots: number; fetchResult: WeekFetchResult }> {
  const fetchResult = await fetchWeekDocuments(week, signalGroups, categoryKey);
  if (fetchResult.items.length === 0) return { docs: 0, snapshots: 0, fetchResult };

  const stored = await storeDocuments(fetchResult.items, categoryKey);
  const enhanced = await assessWeek(fetchResult.items, categoryKey, week.end, aiOptions);
  await saveSnapshot(enhanced, new Date(week.end));
  await storeDocumentScores(scoreDocumentBatch(fetchResult.items, categoryKey));
  await storeWeeklyAggregate(await computeWeeklyAggregate(categoryKey, week.start));

  console.log(
    `  [${categoryKey}] ${week.start} → ${week.end}: ${fetchResult.items.length} docs, status=${enhanced.status}${enhanced.aiResult ? ' (AI)' : ''}`,
  );
  await sleep(500);
  return { docs: stored, snapshots: 1, fetchResult };
}

/** Run a week through ingest or full processing. Catches unexpected errors. */
async function runWeek(
  week: { start: string; end: string },
  signalGroups: SignalGroups,
  categoryKey: string,
  ingestOnly: boolean,
  aiOptions: AiOptions,
): Promise<{ docs: number; snapshots: number; fetchResult: WeekFetchResult | null }> {
  try {
    if (ingestOnly) {
      const r = await ingestWeek(week, signalGroups, categoryKey);
      return { docs: r.docs, snapshots: 0, fetchResult: r.fetchResult };
    }
    const r = await processWeek(week, signalGroups, categoryKey, aiOptions);
    return { docs: r.docs, snapshots: r.snapshots, fetchResult: r.fetchResult };
  } catch (err) {
    console.error(`  [${categoryKey}] ${week.start} processing error: ${formatError(err)}`);
    return { docs: 0, snapshots: 0, fetchResult: null };
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
): Promise<'complete' | 'partial' | 'failed'> {
  if (!fetchResult) return 'failed';
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
  aiOptions: AiOptions,
  sourceSignalType?: string,
  ingestOnly?: boolean,
): Promise<{ docs: number; snapshots: number; apiCalls: number }> {
  const signalGroups = buildSignalGroups(signals, sourceSignalType);
  const totalSignals = Object.values(signalGroups).reduce((sum, g) => sum + g.length, 0);
  if (totalSignals === 0) {
    console.log(`  [${categoryKey}] No fetchable signals — skipping`);
    return { docs: 0, snapshots: 0, apiCalls: 0 };
  }

  const sourceOrigin = sourceSignalType?.replace('_json', '');
  const completedWeeks = sourceOrigin
    ? await getCompletedWeekStarts(sourceOrigin, categoryKey)
    : new Set<string>();
  let totalDocs = 0;
  let totalSnapshots = 0;
  let skipped = 0;
  const counts = { complete: 0, partial: 0, failed: 0 };

  for (const week of weeks) {
    if (dryRun) continue;
    if (sourceOrigin && completedWeeks.has(week.start)) {
      skipped++;
      continue;
    }
    const result = await runWeek(week, signalGroups, categoryKey, !!ingestOnly, aiOptions);
    totalDocs += result.docs;
    totalSnapshots += result.snapshots;
    counts[await recordAndClassify(categoryKey, week, result.fetchResult, result.docs)]++;
  }

  if (skipped > 0) console.log(`  [${categoryKey}] Skipped ${skipped} weeks (already complete)`);
  const processed = counts.complete + counts.partial + counts.failed;
  if (processed > 0) {
    console.log(
      `  [${categoryKey}] ${counts.complete} complete, ${counts.partial} partial, ${counts.failed} failed`,
    );
  }
  return { docs: totalDocs, snapshots: totalSnapshots, apiCalls: weeks.length * totalSignals };
}

function resolveSourceFilter(options: BackfillOptions): string | undefined {
  if (!options.source) return undefined;
  const signalType = SOURCE_TO_SIGNAL_TYPE[options.source];
  if (!signalType) {
    const valid = Object.keys(SOURCE_TO_SIGNAL_TYPE).join(', ');
    throw new Error(`Unknown source: ${options.source}. Valid: ${valid}`);
  }
  options.includeRhetoric = false;
  return signalType;
}

export async function runBackfill(options: BackfillOptions = {}): Promise<void> {
  const from = options.from || INAUGURATION_DATE;
  const to = options.to || toDateString(new Date());
  const dryRun = options.dryRun || false;
  const aiOptions: AiOptions = { skipAi: options.skipAi ?? false, model: options.model };
  const sourceSignalType = resolveSourceFilter(options);

  console.log(`[backfill] ${dryRun ? '(DRY RUN) ' : ''}Range: ${from} → ${to}`);
  if (options.source)
    console.log(`[backfill] Source filter: ${options.source} (${sourceSignalType})`);
  if (options.ingestOnly) console.log('[backfill] Mode: ingest-only');
  const aiOff = options.skipAi || options.ingestOnly;
  console.log(
    `[backfill] AI: ${aiOff ? 'disabled' : `enabled (model: ${options.model || 'default'})`}`,
  );

  const weeks = getWeekRanges(from, to);
  console.log(`[backfill] ${weeks.length} weeks to process`);

  const cats = options.category ? CATEGORIES.filter((c) => c.key === options.category) : CATEGORIES;
  if (cats.length === 0) throw new Error(`Category "${options.category}" not found`);
  console.log(`[backfill] ${cats.length} categories to process`);

  let totalDocs = 0;
  let totalSnapshots = 0;
  let totalApiCalls = 0;

  for (const cat of cats) {
    console.log(`\n[backfill] === ${cat.key} (${cat.signals.length} signals) ===`);
    const r = await backfillCategory(
      cat.key,
      cat.signals,
      weeks,
      dryRun,
      aiOptions,
      sourceSignalType,
      options.ingestOnly,
    );
    totalDocs += r.docs;
    totalSnapshots += r.snapshots;
    totalApiCalls += r.apiCalls;
  }

  if (options.includeRhetoric !== false && !options.category) {
    totalDocs += await backfillRhetoricWithAggregation(weeks, dryRun);
  }

  console.log(`\n[backfill] === Summary ===`);
  console.log(`  API calls: ${dryRun ? `~${totalApiCalls} (estimated)` : totalApiCalls}`);
  console.log(`  Documents stored: ${totalDocs}`);
  console.log(`  Snapshots saved: ${totalSnapshots}`);
}

function parseCliArgs(args: string[]): BackfillOptions {
  const opts: BackfillOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--from') opts.from = args[++i];
    else if (arg === '--to') opts.to = args[++i];
    else if (arg === '--category') opts.category = args[++i];
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--no-rhetoric') opts.includeRhetoric = false;
    else if (arg === '--skip-ai') opts.skipAi = true;
    else if (arg === '--model') opts.model = args[++i];
    else if (arg === '--source') opts.source = args[++i];
    else if (arg === '--ingest-only') opts.ingestOnly = true;
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
