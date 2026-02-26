import { assessWeek } from '@/lib/cron/assess-week';
import type { AiOptions } from '@/lib/cron/assess-week';
import {
  fetchWeekItemsCourtListener,
  fetchWeekItemsDoj,
  fetchWeekItemsFec,
  fetchWeekItemsFr,
  fetchWeekItemsGovInfo,
} from '@/lib/cron/backfill-fetchers';
import { backfillRhetoricWithAggregation } from '@/lib/cron/backfill-rhetoric';
import { CATEGORIES } from '@/lib/data/categories';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import { saveSnapshot } from '@/lib/services/snapshot-store';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { deduplicateByUrl } from '@/lib/utils/collections';
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

async function fetchWeekDocuments(
  week: { start: string; end: string },
  signalGroups: SignalGroups,
  categoryKey: string,
): Promise<ContentItem[]> {
  const weekItems: ContentItem[] = [];
  if (signalGroups.fr.length > 0) {
    weekItems.push(...(await fetchWeekItemsFr(signalGroups.fr, week, categoryKey)));
  }
  if (signalGroups.cl.length > 0) {
    weekItems.push(...(await fetchWeekItemsCourtListener(signalGroups.cl, week, categoryKey)));
  }
  if (signalGroups.doj.length > 0) {
    weekItems.push(...(await fetchWeekItemsDoj(signalGroups.doj, week, categoryKey)));
  }
  if (signalGroups.gi.length > 0) {
    weekItems.push(...(await fetchWeekItemsGovInfo(signalGroups.gi, week, categoryKey)));
  }
  if (signalGroups.fec.length > 0) {
    weekItems.push(...(await fetchWeekItemsFec(signalGroups.fec, week, categoryKey)));
  }
  return deduplicateByUrl(weekItems);
}

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

  const signalGroups: SignalGroups = {
    fr: signals.filter((s) => s.type === 'federal_register'),
    cl: signals.filter((s) => s.type === 'courtlistener'),
    doj: signals.filter((s) => s.type === 'doj_json'),
    gi: signals.filter((s) => s.type === 'govinfo'),
    fec: signals.filter((s) => s.type === 'fec_json'),
  };

  // Filter to single source type when --source is specified
  if (sourceSignalType) {
    const keepKey = SIGNAL_TYPE_TO_GROUP_KEY[sourceSignalType];
    for (const key of Object.keys(signalGroups) as Array<keyof SignalGroups>) {
      if (key !== keepKey) signalGroups[key] = [];
    }
  }

  const totalSignals = Object.values(signalGroups).reduce((sum, g) => sum + g.length, 0);

  if (totalSignals === 0) {
    console.log(`  [${categoryKey}] No fetchable signals — skipping`);
    return { docs: 0, snapshots: 0, apiCalls: 0 };
  }

  for (const week of weeks) {
    apiCalls += totalSignals;
    if (dryRun) continue;

    if (ingestOnly) {
      const result = await ingestBackfillWeek(week, signalGroups, categoryKey);
      totalDocs += result.docs;
    } else {
      const result = await processBackfillWeek(week, signalGroups, categoryKey, aiOptions);
      totalDocs += result.docs;
      totalSnapshots += result.snapshots;
    }
  }

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
