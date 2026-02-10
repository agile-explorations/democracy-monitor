/**
 * CLI script to backfill baseline data from Federal Register historical documents.
 *
 * Usage:
 *   pnpm build-baseline                              # All baselines, all categories
 *   pnpm build-baseline --baseline biden_2024         # Single baseline
 *   pnpm build-baseline --category courts             # Single category
 *   pnpm build-baseline --dry-run                     # Preview without writing
 *   pnpm build-baseline --skip-fetch                  # Skip API calls, just recompute baselines
 *   pnpm build-baseline --no-rhetoric                 # Skip White House + GDELT rhetoric fetch
 *   pnpm build-baseline --skip-ai                     # Keyword-only assessment (no AI Skeptic)
 *   pnpm build-baseline --model gpt-4o-mini           # Use specific model for AI Skeptic
 */

import { assessWeek } from '@/lib/cron/assess-week';
import type { AiOptions } from '@/lib/cron/assess-week';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import { computeBaseline, getBaselineConfig, storeBaseline } from '@/lib/services/baseline-service';
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
import { getWeekRanges } from '@/lib/utils/date-utils';

interface BackfillBaselineOptions {
  baseline?: string;
  category?: string;
  dryRun?: boolean;
  skipFetch?: boolean;
  includeRhetoric?: boolean;
  skipAi?: boolean;
  model?: string;
}

async function fetchWeekData(
  frSignals: Array<{ url: string; type: string }>,
  week: { start: string; end: string },
  categoryKey: string,
  dryRun: boolean,
): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  for (const signal of frSignals) {
    const params = parseSignalParams(signal.url);
    if (dryRun) continue;
    try {
      const fetched = await fetchFederalRegisterHistorical({
        ...params,
        dateFrom: week.start,
        dateTo: week.end,
        perPage: 1000,
        delayMs: 200,
      });
      items.push(...fetched);
    } catch (err) {
      console.error(`  [${categoryKey}] FR fetch error for ${week.start}:`, err);
    }
  }
  return items;
}

async function backfillBaselineCategory(
  categoryKey: string,
  signals: Array<{ url: string; type: string }>,
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
  aiOptions: AiOptions,
): Promise<{ docs: number; weeks: number; apiCalls: number }> {
  let totalDocs = 0;
  let weeksProcessed = 0;
  let apiCalls = 0;

  const frSignals = signals.filter((s) => s.type === 'federal_register');

  if (frSignals.length === 0) {
    console.log(`  [${categoryKey}] No Federal Register signals — skipping`);
    return { docs: 0, weeks: 0, apiCalls: 0 };
  }

  for (const week of weeks) {
    const weekItems = await fetchWeekData(frSignals, week, categoryKey, dryRun);
    apiCalls += frSignals.length;

    if (dryRun) continue;

    const dedupedItems = deduplicateByUrl(weekItems);

    if (dedupedItems.length > 0) {
      await storeDocuments(dedupedItems, categoryKey);
      totalDocs += dedupedItems.length;

      const docScores = scoreDocumentBatch(dedupedItems, categoryKey);
      await storeDocumentScores(docScores);

      const enhanced = await assessWeek(dedupedItems, categoryKey, week.end, aiOptions);
      await saveSnapshot(enhanced, new Date(week.end));
    }

    const agg = await computeWeeklyAggregate(categoryKey, week.start);
    await storeWeeklyAggregate(agg);
    weeksProcessed++;

    process.stdout.write(
      `\r  [${categoryKey}] ${week.start}: ${dedupedItems.length} docs, ${weeksProcessed}/${weeks.length} weeks`,
    );

    await sleep(500);
  }

  if (weeksProcessed > 0) console.log('');

  return { docs: totalDocs, weeks: weeksProcessed, apiCalls };
}

async function backfillBaselineGdelt(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<number> {
  let gdeltDocs = 0;

  console.log('[baseline] Fetching GDELT article data...');
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
  }

  if (dryRun) {
    console.log(`  GDELT: [dry run] ~${weeks.length * GDELT_QUERIES.length} API calls`);
  } else {
    console.log(`  GDELT: ${gdeltDocs} total documents stored`);
  }
  return gdeltDocs;
}

async function backfillBaselineRhetoric(
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
): Promise<{ whDocs: number; gdeltDocs: number }> {
  let whDocs = 0;

  console.log('\n[baseline] === Rhetoric Sources ===');

  console.log('[baseline] Fetching White House briefing-room archive...');
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

  const gdeltDocs = await backfillBaselineGdelt(weeks, dryRun);

  return { whDocs, gdeltDocs };
}

async function processBaselineConfig(
  config: (typeof BASELINE_CONFIGS)[number],
  categoriesToProcess: typeof CATEGORIES,
  dryRun: boolean,
  skipFetch: boolean,
  includeRhetoric: boolean,
  aiOptions: AiOptions,
): Promise<void> {
  console.log(
    `\n[baseline] === ${config.label} (${config.from} → ${config.to}) ===${dryRun ? ' (DRY RUN)' : ''}`,
  );

  const weeks = getWeekRanges(config.from, config.to);

  if (!skipFetch) {
    console.log(`[baseline] ${weeks.length} weeks to process`);

    let totalDocs = 0;
    let totalApiCalls = 0;

    for (const cat of categoriesToProcess) {
      console.log(`\n[baseline] ${cat.key} (${cat.signals.length} signals)`);
      const result = await backfillBaselineCategory(cat.key, cat.signals, weeks, dryRun, aiOptions);
      totalDocs += result.docs;
      totalApiCalls += result.apiCalls;
    }

    if (includeRhetoric) {
      const rhetoric = await backfillBaselineRhetoric(weeks, dryRun);
      totalDocs += rhetoric.whDocs + rhetoric.gdeltDocs;

      if (!dryRun) {
        console.log('\n[baseline] === Intent Weekly Aggregation ===');
        for (const week of weeks) {
          try {
            await aggregateAllAreas(week.start);
          } catch (err) {
            console.error(`[baseline] Intent aggregation failed for ${week.start}:`, err);
          }
        }
        console.log(`[baseline] Intent weekly aggregation complete for ${weeks.length} weeks`);
      }
    }

    console.log(`\n[baseline] Fetch complete: ${totalDocs} docs, ${totalApiCalls} API calls`);
  } else {
    console.log('[baseline] --skip-fetch: skipping API calls, recomputing from existing data');
  }

  if (!dryRun) {
    console.log(`[baseline] Computing baseline statistics for ${config.id}...`);
    const baselineResults = await computeBaseline(config);
    await storeBaseline(baselineResults);
    console.log(`[baseline] Stored baselines for ${baselineResults.length} categories`);
  }
}

export async function runBackfillBaseline(options: BackfillBaselineOptions): Promise<void> {
  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  const dryRun = options.dryRun ?? false;
  const skipFetch = options.skipFetch ?? false;
  const includeRhetoric = options.includeRhetoric !== false; // default true
  const aiOptions: AiOptions = { skipAi: options.skipAi ?? false, model: options.model };

  console.log(
    `[baseline] AI: ${aiOptions.skipAi ? 'disabled' : `enabled (model: ${aiOptions.model || 'default'})`}`,
  );

  const configsToProcess = options.baseline
    ? BASELINE_CONFIGS.filter((c) => c.id === options.baseline)
    : BASELINE_CONFIGS;

  if (configsToProcess.length === 0) {
    const config = getBaselineConfig(options.baseline!);
    if (!config) {
      throw new Error(
        `Unknown baseline "${options.baseline}". Available: ${BASELINE_CONFIGS.map((c) => c.id).join(', ')}`,
      );
    }
  }

  const categoriesToProcess = options.category
    ? CATEGORIES.filter((c) => c.key === options.category)
    : CATEGORIES;

  if (categoriesToProcess.length === 0) {
    throw new Error(`Category "${options.category}" not found`);
  }

  for (const config of configsToProcess) {
    await processBaselineConfig(
      config,
      categoriesToProcess,
      dryRun,
      skipFetch,
      includeRhetoric,
      aiOptions,
    );
  }

  console.log('\n[baseline] Done.');
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const options: BackfillBaselineOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--baseline':
        options.baseline = args[++i];
        break;
      case '--category':
        options.category = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--skip-fetch':
        options.skipFetch = true;
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

  runBackfillBaseline(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[baseline] Fatal error:', err);
      process.exit(1);
    });
}
