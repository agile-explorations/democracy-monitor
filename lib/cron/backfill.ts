import { assessWeek } from '@/lib/cron/assess-week';
import type { AiOptions } from '@/lib/cron/assess-week';
import { fetchWeekDocuments } from '@/lib/cron/backfill-fetchers';
import { backfillRhetoricWithAggregation } from '@/lib/cron/backfill-rhetoric';
import { CATEGORIES } from '@/lib/data/categories';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { countWeekDocsBySource, storeDocuments } from '@/lib/services/document-store';
import { saveSnapshot } from '@/lib/services/snapshot-store';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { getWeekRanges, toDateString } from '@/lib/utils/date-utils';

const INAUGURATION_DATE = '2025-01-20';
const MAX_WEEK_RETRIES = 3;
const RETRY_BACKOFF_MS = 10_000;

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

async function ingestBackfillWeek(
  week: { start: string; end: string },
  signalGroups: SignalGroups,
  categoryKey: string,
): Promise<{ docs: number }> {
  const dedupedItems = await fetchWeekDocuments(week, signalGroups, categoryKey);
  if (dedupedItems.length === 0) return { docs: 0 };

  const stored = await storeDocuments(dedupedItems, categoryKey);
  const docScores = scoreDocumentBatch(dedupedItems, categoryKey);
  await storeDocumentScores(docScores);

  console.log(
    `  [${categoryKey}] ${week.start} → ${week.end}: ${dedupedItems.length} docs (ingest-only)`,
  );
  await sleep(500);
  return { docs: stored };
}

async function processBackfillWeek(
  week: { start: string; end: string },
  signalGroups: SignalGroups,
  categoryKey: string,
  aiOptions: AiOptions,
): Promise<{ docs: number; snapshots: number }> {
  const dedupedItems = await fetchWeekDocuments(week, signalGroups, categoryKey);
  if (dedupedItems.length === 0) return { docs: 0, snapshots: 0 };

  const stored = await storeDocuments(dedupedItems, categoryKey);
  const enhanced = await assessWeek(dedupedItems, categoryKey, week.end, aiOptions);

  await saveSnapshot(enhanced, new Date(week.end));

  const docScores = scoreDocumentBatch(dedupedItems, categoryKey);
  await storeDocumentScores(docScores);

  const agg = await computeWeeklyAggregate(categoryKey, week.start);
  await storeWeeklyAggregate(agg);

  console.log(
    `  [${categoryKey}] ${week.start} → ${week.end}: ${dedupedItems.length} docs, status=${enhanced.status}${enhanced.aiResult ? ' (AI)' : ''}`,
  );

  await sleep(500);
  return { docs: stored, snapshots: 1 };
}

async function processWeekWithRetry(
  week: { start: string; end: string },
  signalGroups: SignalGroups,
  categoryKey: string,
  ingestOnly: boolean,
  aiOptions: AiOptions,
): Promise<{ docs: number; snapshots: number }> {
  for (let attempt = 1; attempt <= MAX_WEEK_RETRIES; attempt++) {
    try {
      if (ingestOnly) {
        const r = await ingestBackfillWeek(week, signalGroups, categoryKey);
        return { docs: r.docs, snapshots: 0 };
      }
      const r = await processBackfillWeek(week, signalGroups, categoryKey, aiOptions);
      return { docs: r.docs, snapshots: r.snapshots };
    } catch (err) {
      if (attempt < MAX_WEEK_RETRIES) {
        const delay = RETRY_BACKOFF_MS * attempt;
        console.log(
          `  [${categoryKey}] ${week.start} attempt ${attempt} failed, retrying in ${delay / 1000}s...`,
        );
        await sleep(delay);
      } else {
        console.error(`  [${categoryKey}] ${week.start} failed after ${MAX_WEEK_RETRIES} attempts`);
      }
    }
  }
  return { docs: 0, snapshots: 0 };
}

function buildSignalGroups(
  signals: Array<{ url: string; type: string }>,
  sourceSignalType?: string,
): SignalGroups {
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

async function backfillCategory(
  categoryKey: string,
  signals: Array<{ url: string; type: string }>,
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
  aiOptions: AiOptions,
  sourceSignalType?: string,
  ingestOnly?: boolean,
): Promise<{ docs: number; snapshots: number; apiCalls: number }> {
  let totalDocs = 0;
  let totalSnapshots = 0;
  let apiCalls = 0;

  const signalGroups = buildSignalGroups(signals, sourceSignalType);
  const totalSignals = Object.values(signalGroups).reduce((sum, g) => sum + g.length, 0);

  if (totalSignals === 0) {
    console.log(`  [${categoryKey}] No fetchable signals — skipping`);
    return { docs: 0, snapshots: 0, apiCalls: 0 };
  }

  const sourceOrigin = sourceSignalType?.replace('_json', '');
  let skipped = 0;

  for (const week of weeks) {
    apiCalls += totalSignals;
    if (dryRun) continue;

    if (sourceOrigin) {
      const existing = await countWeekDocsBySource(sourceOrigin, categoryKey, week.start, week.end);
      if (existing > 0) {
        skipped++;
        continue;
      }
    }

    const result = await processWeekWithRetry(
      week,
      signalGroups,
      categoryKey,
      !!ingestOnly,
      aiOptions,
    );
    totalDocs += result.docs;
    totalSnapshots += result.snapshots;
  }

  if (skipped > 0) console.log(`  [${categoryKey}] Skipped ${skipped} weeks (already ingested)`);

  return { docs: totalDocs, snapshots: totalSnapshots, apiCalls };
}

function logConfig(options: BackfillOptions, from: string, to: string, signalType?: string): void {
  console.log(`[backfill] ${options.dryRun ? '(DRY RUN) ' : ''}Range: ${from} → ${to}`);
  if (options.source)
    console.log(`[backfill] Source filter: ${options.source} (signal type: ${signalType})`);
  if (options.ingestOnly)
    console.log('[backfill] Mode: ingest-only (fetch + store + score, no assessment/aggregate)');
  const aiOff = options.skipAi || options.ingestOnly;
  console.log(
    `[backfill] AI: ${aiOff ? 'disabled' : `enabled (model: ${options.model || 'default'})`}`,
  );
}

function resolveSourceFilter(options: BackfillOptions): string | undefined {
  if (!options.source) return undefined;
  const signalType = SOURCE_TO_SIGNAL_TYPE[options.source];
  if (!signalType) {
    const valid = Object.keys(SOURCE_TO_SIGNAL_TYPE).join(', ');
    throw new Error(`Unknown source: ${options.source}. Valid: ${valid}`);
  }
  options.includeRhetoric = false; // rhetoric is FR/WH/GDELT only
  return signalType;
}

export async function runBackfill(options: BackfillOptions = {}): Promise<void> {
  const from = options.from || INAUGURATION_DATE;
  const to = options.to || toDateString(new Date());
  const dryRun = options.dryRun || false;
  const aiOptions: AiOptions = { skipAi: options.skipAi ?? false, model: options.model };
  const sourceSignalType = resolveSourceFilter(options);
  const includeRhetoric = options.includeRhetoric !== false;

  logConfig(options, from, to, sourceSignalType);

  const weeks = getWeekRanges(from, to);
  console.log(`[backfill] ${weeks.length} weeks to process`);

  const categoriesToProcess = options.category
    ? CATEGORIES.filter((c) => c.key === options.category)
    : CATEGORIES;

  if (categoriesToProcess.length === 0) {
    throw new Error(`Category "${options.category}" not found`);
  }

  console.log(`[backfill] ${categoriesToProcess.length} categories to process`);

  let totalDocs = 0;
  let totalSnapshots = 0;
  let totalApiCalls = 0;

  for (const cat of categoriesToProcess) {
    console.log(`\n[backfill] === ${cat.key} (${cat.signals.length} signals) ===`);
    const result = await backfillCategory(
      cat.key,
      cat.signals,
      weeks,
      dryRun,
      aiOptions,
      sourceSignalType,
      options.ingestOnly,
    );
    totalDocs += result.docs;
    totalSnapshots += result.snapshots;
    totalApiCalls += result.apiCalls;
  }

  if (includeRhetoric && !options.category) {
    totalDocs += await backfillRhetoricWithAggregation(weeks, dryRun);
  }

  console.log(`\n[backfill] === Summary ===`);
  console.log(`  API calls: ${dryRun ? `~${totalApiCalls} (estimated)` : totalApiCalls}`);
  console.log(`  Documents stored: ${totalDocs}`);
  console.log(`  Snapshots saved: ${totalSnapshots}`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const options: BackfillOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--from':
        options.from = args[++i];
        break;
      case '--to':
        options.to = args[++i];
        break;
      case '--category':
        options.category = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--no-rhetoric':
        options.includeRhetoric = false;
        break;
      case '--skip-ai':
        options.skipAi = true;
        break;
      case '--model':
        options.model = args[++i];
        break;
      case '--source':
        options.source = args[++i];
        break;
      case '--ingest-only':
        options.ingestOnly = true;
        break;
    }
  }

  runBackfill(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill] Fatal error:', err);
      process.exit(1);
    });
}
