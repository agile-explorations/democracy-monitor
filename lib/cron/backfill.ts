import { and, sql } from 'drizzle-orm';
import { backfillChrg } from '@/lib/cron/backfill-chrg';
import { backfillCpd } from '@/lib/cron/backfill-cpd';
import { backfillCrec } from '@/lib/cron/backfill-crec';
import { fetchWeekDocuments } from '@/lib/cron/backfill-fetchers';
import type { WeekFetchResult } from '@/lib/cron/backfill-fetchers';
import { backfillLegiscan } from '@/lib/cron/legiscan-bulk';
import {
  buildAnalysisPeriodCondition,
  buildActiveSourceCondition,
} from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { getDocumentsForWeek, storeDocuments } from '@/lib/services/document-store';
import { getCompletedWeekStarts, recordWeekFetchResults } from '@/lib/services/fetch-log-store';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';
import { withCronLock } from '@/lib/utils/cron-lock';
import { getWeekRanges, toDateString } from '@/lib/utils/date-utils';

const INAUGURATION_DATE = '2025-01-20';
const EMBED_BATCH_SIZE = 50;

interface BackfillOptions {
  from?: string;
  to?: string;
  category?: string;
  dryRun?: boolean;
  source?: string;
  excludeSource?: string;
  force?: boolean;
  forceUnlock?: boolean;
  clean?: boolean;
  confirm?: boolean;
}

const SOURCE_TO_SIGNAL_TYPE: Record<string, string> = {
  courtlistener: 'courtlistener',
  doj: 'doj_json',
  govinfo: 'govinfo',
  fec: 'fec_json',
  fr: 'federal_register',
  oig: 'oig_html',
};

const SPECIAL_SOURCES: ReadonlySet<string> = new Set(['legiscan', 'cpd', 'crec', 'chrg']);
const ALL_VALID_SOURCES = [...Object.keys(SOURCE_TO_SIGNAL_TYPE), ...SPECIAL_SOURCES];

type Signal = { url: string; type: string };
type SignalGroups = {
  fr: Signal[];
  cl: Signal[];
  doj: Signal[];
  gi: Signal[];
  fec: Signal[];
  oig: Signal[];
};

const SIGNAL_TYPE_TO_GROUP_KEY: Record<string, keyof SignalGroups> = {
  courtlistener: 'cl',
  doj_json: 'doj',
  govinfo: 'gi',
  fec_json: 'fec',
  federal_register: 'fr',
  oig_html: 'oig',
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

function buildSignalGroups(
  signals: Signal[],
  sourceSignalType?: string,
  excludeSignalType?: string,
): SignalGroups {
  const groups: SignalGroups = {
    fr: signals.filter((s) => s.type === 'federal_register'),
    cl: signals.filter((s) => s.type === 'courtlistener'),
    doj: signals.filter((s) => s.type === 'doj_json'),
    gi: signals.filter((s) => s.type === 'govinfo'),
    fec: signals.filter((s) => s.type === 'fec_json'),
    oig: signals.filter((s) => s.type === 'oig_html'),
  };
  if (sourceSignalType) {
    const keepKey = SIGNAL_TYPE_TO_GROUP_KEY[sourceSignalType];
    for (const key of Object.keys(groups) as Array<keyof SignalGroups>) {
      if (key !== keepKey) groups[key] = [];
    }
  }
  if (excludeSignalType) {
    const excludeKey = SIGNAL_TYPE_TO_GROUP_KEY[excludeSignalType];
    if (excludeKey) groups[excludeKey] = [];
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
  force?: boolean,
  excludeSignalType?: string,
): Promise<{ docs: number; apiCalls: number }> {
  const signalGroups = buildSignalGroups(signals, sourceSignalType, excludeSignalType);
  const totalSignals = Object.values(signalGroups).reduce((sum, g) => sum + g.length, 0);
  if (totalSignals === 0) {
    console.log(`  [${categoryKey}] No fetchable signals — skipping`);
    return { docs: 0, apiCalls: 0 };
  }

  const sourceOrigin = sourceSignalType?.replace('_json', '');
  const completedWeeks =
    sourceOrigin && !force
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

  // Embed unprocessed documents for this category after all weeks (analysis periods + active sources)
  try {
    const dateFilter = and(
      buildAnalysisPeriodCondition(documents.publishedAt),
      buildActiveSourceCondition(documents.sourceOrigin),
    );
    const embedded = await embedUnprocessedDocuments(EMBED_BATCH_SIZE, categoryKey, dateFilter);
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
  if (SPECIAL_SOURCES.has(source)) return undefined; // LegiScan/CPD handled separately
  const signalType = SOURCE_TO_SIGNAL_TYPE[source];
  if (!signalType) {
    throw new Error(`Unknown source: ${source}. Valid: ${ALL_VALID_SOURCES.join(', ')}`);
  }
  return signalType;
}

/** Delete all documents and derived data within a date range. */
async function cleanDateRange(from: string, to: string): Promise<void> {
  // nosemgrep: opengrep.cron-needs-env-config — called from runBackfill after loadEnvConfig
  const db = getDb();

  console.log(`[backfill] Cleaning all data for ${from} → ${to}...`);

  // 1. ai_document_assessments (references documents via url/category)
  const assess = await db.execute(sql`
    DELETE FROM ai_document_assessments
    WHERE week_of >= ${from}::date AND week_of < ${to}::date + interval '1 day'
  `);
  console.log(`  ai_document_assessments: ${assess.rowCount} deleted`);

  // 2. document_scores (references documents.url)
  const scores = await db.execute(sql`
    DELETE FROM document_scores
    WHERE url IN (
      SELECT url FROM documents
      WHERE published_at >= ${from}::timestamptz AND published_at < ${to}::timestamptz + interval '1 day'
    )
  `);
  console.log(`  document_scores: ${scores.rowCount} deleted`);

  // 3. p2025_matches (references documents.id)
  const p2025 = await db.execute(sql`
    DELETE FROM p2025_matches
    WHERE document_id IN (
      SELECT id FROM documents
      WHERE published_at >= ${from}::timestamptz AND published_at < ${to}::timestamptz + interval '1 day'
    )
  `);
  console.log(`  p2025_matches: ${p2025.rowCount} deleted`);

  // 4. weekly_aggregates
  const agg = await db.execute(sql`
    DELETE FROM weekly_aggregates
    WHERE week_of >= ${from}::date AND week_of < ${to}::date + interval '1 day'
  `);
  console.log(`  weekly_aggregates: ${agg.rowCount} deleted`);

  // 5. narratives
  const nar = await db.execute(sql`
    DELETE FROM narratives
    WHERE week_of >= ${from}::date AND week_of < ${to}::date + interval '1 day'
  `);
  console.log(`  narratives: ${nar.rowCount} deleted`);

  // 6. fetch_log
  const fl = await db.execute(sql`
    DELETE FROM fetch_log
    WHERE week_start >= ${from}::date AND week_start < ${to}::date + interval '1 day'
  `);
  console.log(`  fetch_log: ${fl.rowCount} deleted`);

  // 7. documents (last — other tables reference it)
  const docs = await db.execute(sql`
    DELETE FROM documents
    WHERE published_at >= ${from}::timestamptz AND published_at < ${to}::timestamptz + interval '1 day'
  `);
  console.log(`  documents: ${docs.rowCount} deleted`);

  console.log('[backfill] Clean complete.');
}

export async function runBackfill(options: BackfillOptions = {}): Promise<void> {
  const from = options.from || INAUGURATION_DATE;
  const to = options.to || toDateString(new Date());
  const dryRun = options.dryRun || false;
  const sourceSignalType = resolveSourceFilter(options.source);
  const excludeSignalType = resolveSourceFilter(options.excludeSource);

  console.log(`[backfill] ${dryRun ? '(DRY RUN) ' : ''}Range: ${from} → ${to}`);
  if (options.source)
    console.log(
      `[backfill] Source filter: ${options.source}${sourceSignalType ? ` (${sourceSignalType})` : ''}`,
    );
  if (options.excludeSource) console.log(`[backfill] Excluding source: ${options.excludeSource}`);
  if (options.force) console.log('[backfill] Force mode: re-fetching all weeks');

  // --clean: delete all data in the date range before backfilling
  if (options.clean) {
    if (!options.confirm) {
      console.error(
        '[backfill] --clean requires --confirm to execute. This will delete ALL documents',
      );
      console.error(
        `  and derived data (scores, assessments, aggregates, narratives) for ${from} → ${to}.`,
      );
      process.exit(1);
    }
    if (!options.from) {
      console.error('[backfill] --clean requires --from to be set (safety: no unbounded deletes)');
      process.exit(1);
    }
    await cleanDateRange(from, to);
  }

  const weeks = getWeekRanges(from, to);
  console.log(`[backfill] ${weeks.length} weeks to process`);

  const cats = options.category ? CATEGORIES.filter((c) => c.key === options.category) : CATEGORIES;
  if (cats.length === 0) throw new Error(`Category "${options.category}" not found`);
  console.log(`[backfill] ${cats.length} categories to process`);

  let totalDocs = 0;
  let totalApiCalls = 0;
  const isSpecialSource = options.source ? SPECIAL_SOURCES.has(options.source) : false;

  // Category-based signal backfill (skip if --source is a special source)
  if (!isSpecialSource) {
    for (const cat of cats) {
      console.log(`\n[backfill] === ${cat.key} (${cat.signals.length} signals) ===`);
      const r = await backfillCategory(
        cat.key,
        cat.signals,
        weeks,
        dryRun,
        sourceSignalType,
        options.force,
        excludeSignalType,
      );
      totalDocs += r.docs;
      totalApiCalls += r.apiCalls;
    }
  }

  // CPD backfill: runs when no source filter, or when source is cpd
  if ((!options.source || options.source === 'cpd') && !options.category) {
    totalDocs += await backfillCpd(weeks, dryRun);
  }

  // CREC backfill: runs when no source filter, or when source is crec
  if ((!options.source || options.source === 'crec') && !options.category) {
    totalDocs += await backfillCrec(weeks, dryRun);
  }

  // CHRG backfill: one windowed pass (hearing transcripts publish months
  // after dateIssued, so per-week fetching would miss late arrivals)
  if ((!options.source || options.source === 'chrg') && !options.category) {
    totalDocs += await backfillChrg(from, to, dryRun);
  }

  // LegiScan backfill: runs when no source filter, or when source is legiscan
  if (!options.source || options.source === 'legiscan') {
    totalDocs += await backfillLegiscan(from, to, dryRun);
  }

  // Opinion-first CL backfill: find opinions by issue date for dockets from ANY era.
  if (!options.source || options.source === 'courtlistener') {
    const { tryOpinionFirstPass } = await import('@/lib/services/cl-bulk-staging');
    const r = await tryOpinionFirstPass(from, to, dryRun);
    if (r.opinionsStored > 0) totalDocs += r.opinionsStored;
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
    else if (arg === '--exclude-source') opts.excludeSource = args[++i];
    else if (arg === '--force') opts.force = true;
    else if (arg === '--force-unlock') opts.forceUnlock = true;
    else if (arg === '--clean') opts.clean = true;
    else if (arg === '--confirm') opts.confirm = true;
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm backfill [options]

Options:
  --from <date>       Start date (YYYY-MM-DD)
  --to <date>         End date (YYYY-MM-DD)
  --category <key>    Process a single category
  --source <name>     Limit to a specific source
  --dry-run           Preview without writing to DB
  --force             Force re-fetch even if already completed
  --force-unlock      Clear stale cron lock before running
  --exclude-source <name>  Skip a specific source (e.g. courtlistener)
  --clean --confirm   Delete all docs + derived data in date range before backfilling`,
  );
  const opts = parseCliArgs(argv);
  withCronLock('backfill', () => runBackfill(opts), undefined, opts.forceUnlock)
    .then((ran) => process.exit(ran ? 0 : 0))
    .catch((err) => {
      console.error('[backfill] Fatal error:', err);
      process.exit(1);
    });
}
