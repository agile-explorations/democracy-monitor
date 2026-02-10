import { assessWeek } from '@/lib/cron/assess-week';
import type { AiOptions } from '@/lib/cron/assess-week';
import { CATEGORIES } from '@/lib/data/categories';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import {
  fetchFederalRegisterHistorical,
  parseSignalParams,
} from '@/lib/services/federal-register-fetcher';
import { aggregateAllAreas } from '@/lib/services/intent-weekly-aggregator';
import {
  fetchWhiteHouseHistorical,
  fetchGdeltHistorical,
  GDELT_QUERIES,
} from '@/lib/services/rhetoric-fetcher';
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
}

async function fetchWeekItems(
  frSignals: Array<{ url: string; type: string }>,
  week: { start: string; end: string },
  categoryKey: string,
): Promise<ContentItem[]> {
  const weekItems: ContentItem[] = [];

  for (const signal of frSignals) {
    const params = parseSignalParams(signal.url);
    try {
      const items = await fetchFederalRegisterHistorical({
        ...params,
        dateFrom: week.start,
        dateTo: week.end,
        perPage: 1000,
        delayMs: 200,
      });
      weekItems.push(...items);
    } catch (err) {
      console.error(`  [${categoryKey}] FR fetch error for ${week.start}:`, err);
    }
  }

  return weekItems;
}

async function processBackfillWeek(
  week: { start: string; end: string },
  frSignals: Array<{ url: string; type: string }>,
  categoryKey: string,
  aiOptions: AiOptions,
): Promise<{ docs: number; snapshots: number }> {
  const weekItems = await fetchWeekItems(frSignals, week, categoryKey);
  const dedupedItems = deduplicateByUrl(weekItems);
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
): Promise<{ docs: number; snapshots: number; apiCalls: number }> {
  let totalDocs = 0;
  let totalSnapshots = 0;
  let apiCalls = 0;

  const frSignals = signals.filter((s) => s.type === 'federal_register');

  if (frSignals.length === 0) {
    console.log(`  [${categoryKey}] No Federal Register signals — skipping`);
    return { docs: 0, snapshots: 0, apiCalls: 0 };
  }

  for (const week of weeks) {
    apiCalls += frSignals.length;
    if (dryRun) continue;

    const result = await processBackfillWeek(week, frSignals, categoryKey, aiOptions);
    totalDocs += result.docs;
    totalSnapshots += result.snapshots;
  }

  return { docs: totalDocs, snapshots: totalSnapshots, apiCalls };
}

async function backfillGdeltWeeks(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<number> {
  let gdeltDocs = 0;

  console.log('[backfill] Fetching GDELT article data...');
  for (const week of weeks) {
    for (const query of GDELT_QUERIES) {
      if (dryRun) continue;

      try {
        const items = await fetchGdeltHistorical({
          query,
          dateFrom: week.start,
          dateTo: week.end,
          maxRecords: 250,
          delayMs: 300,
        });
        if (items.length > 0) {
          const stored = await storeDocuments(items, 'intent');
          gdeltDocs += stored;
        }
      } catch (err) {
        console.error(`  GDELT error for ${week.start} query="${query.slice(0, 30)}...":`, err);
      }
    }
    if (!dryRun && gdeltDocs > 0) {
      process.stdout.write(`  GDELT ${week.start}: ${gdeltDocs} total stored\r`);
    }
  }
  if (!dryRun) console.log(`\n  GDELT: ${gdeltDocs} total documents stored`);
  else {
    const calls = weeks.length * GDELT_QUERIES.length;
    console.log(`  GDELT: [dry run] would make ~${calls} API calls`);
  }

  return gdeltDocs;
}

async function backfillRhetoric(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<{ whDocs: number; gdeltDocs: number }> {
  let whDocs = 0;

  console.log('\n[backfill] === Rhetoric Sources ===');

  console.log('[backfill] Fetching White House briefing-room archive...');
  if (!dryRun) {
    try {
      const whItems = await fetchWhiteHouseHistorical({
        dateFrom: weeks[0].start,
        dateTo: weeks[weeks.length - 1].end,
        delayMs: 500,
      });
      if (whItems.length > 0) {
        const stored = await storeDocuments(whItems, 'intent');
        whDocs = stored;
        console.log(`  White House: ${whItems.length} items fetched, ${stored} stored`);
      } else {
        console.log('  White House: 0 items (site may be blocking)');
      }
    } catch (err) {
      console.error('  White House fetch error:', err);
    }
  } else {
    console.log('  White House: [dry run] would fetch archive pages');
  }

  const gdeltDocs = await backfillGdeltWeeks(weeks, dryRun);

  return { whDocs, gdeltDocs };
}

export async function runBackfill(options: BackfillOptions = {}): Promise<void> {
  const from = options.from || INAUGURATION_DATE;
  const to = options.to || toDateString(new Date());
  const dryRun = options.dryRun || false;
  const includeRhetoric = options.includeRhetoric !== false; // default true
  const aiOptions: AiOptions = { skipAi: options.skipAi ?? false, model: options.model };

  console.log(`[backfill] ${dryRun ? '(DRY RUN) ' : ''}Range: ${from} → ${to}`);
  console.log(
    `[backfill] AI: ${aiOptions.skipAi ? 'disabled' : `enabled (model: ${aiOptions.model || 'default'})`}`,
  );

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
    const result = await backfillCategory(cat.key, cat.signals, weeks, dryRun, aiOptions);
    totalDocs += result.docs;
    totalSnapshots += result.snapshots;
    totalApiCalls += result.apiCalls;
  }

  // Rhetoric backfill
  if (includeRhetoric && !options.category) {
    const rhetoric = await backfillRhetoric(weeks, dryRun);
    totalDocs += rhetoric.whDocs + rhetoric.gdeltDocs;

    // Intent weekly aggregation for each backfilled week
    if (!dryRun) {
      console.log('\n[backfill] === Intent Weekly Aggregation ===');
      for (const week of weeks) {
        try {
          await aggregateAllAreas(week.start);
        } catch (err) {
          console.error(`[backfill] Intent weekly aggregation failed for ${week.start}:`, err);
        }
      }
      console.log(`[backfill] Intent weekly aggregation complete for ${weeks.length} weeks`);
    }
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
    }
  }

  runBackfill(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill] Fatal error:', err);
      process.exit(1);
    });
}
