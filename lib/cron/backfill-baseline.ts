/**
 * CLI script to backfill baseline data from Federal Register historical documents.
 *
 * Usage:
 *   pnpm build-baseline                              # All baselines, all categories
 *   pnpm build-baseline --baseline biden_2024         # Single baseline
 *   pnpm build-baseline --category courts             # Single category
 *   pnpm build-baseline --dry-run                     # Preview without writing
 *   pnpm build-baseline --skip-fetch                  # Skip API calls, just recompute baselines
 */

// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import {
  BASELINE_CONFIGS,
  computeBaseline,
  getBaselineConfig,
  storeBaseline,
} from '@/lib/services/baseline-service';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import { fetchFederalRegisterHistorical, parseSignalParams } from '@/lib/services/feed-fetcher';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';

loadEnvConfig(process.cwd());

interface BackfillBaselineOptions {
  baseline?: string;
  category?: string;
  dryRun?: boolean;
  skipFetch?: boolean;
}

function getWeekRanges(from: string, to: string): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  const current = new Date(from);
  const endDate = new Date(to);

  while (current <= endDate) {
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const actualEnd = weekEnd > endDate ? endDate : weekEnd;

    ranges.push({
      start: current.toISOString().split('T')[0],
      end: actualEnd.toISOString().split('T')[0],
    });

    current.setDate(current.getDate() + 7);
  }

  return ranges;
}

async function backfillBaselineCategory(
  categoryKey: string,
  signals: Array<{ url: string; type: string }>,
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
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
    const weekItems: ContentItem[] = [];

    for (const signal of frSignals) {
      const params = parseSignalParams(signal.url);
      apiCalls++;

      if (dryRun) continue;

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

    if (dryRun) continue;

    // Deduplicate by URL
    const seen = new Set<string>();
    const dedupedItems = weekItems.filter((item) => {
      if (!item.link || seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    });

    if (dedupedItems.length > 0) {
      await storeDocuments(dedupedItems, categoryKey);
      totalDocs += dedupedItems.length;

      const docScores = scoreDocumentBatch(dedupedItems, categoryKey);
      await storeDocumentScores(docScores);
    }

    // Compute and store weekly aggregate
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

async function runBackfillBaseline(options: BackfillBaselineOptions): Promise<void> {
  if (!isDbAvailable()) {
    console.error('[baseline] DATABASE_URL not configured');
    process.exit(1);
  }

  const dryRun = options.dryRun ?? false;
  const skipFetch = options.skipFetch ?? false;

  const configsToProcess = options.baseline
    ? BASELINE_CONFIGS.filter((c) => c.id === options.baseline)
    : BASELINE_CONFIGS;

  if (configsToProcess.length === 0) {
    const config = getBaselineConfig(options.baseline!);
    if (!config) {
      console.error(
        `[baseline] Unknown baseline "${options.baseline}". Available: ${BASELINE_CONFIGS.map((c) => c.id).join(', ')}`,
      );
      process.exit(1);
    }
  }

  const categoriesToProcess = options.category
    ? CATEGORIES.filter((c) => c.key === options.category)
    : CATEGORIES;

  if (categoriesToProcess.length === 0) {
    console.error(`[baseline] Category "${options.category}" not found`);
    process.exit(1);
  }

  for (const config of configsToProcess) {
    console.log(
      `\n[baseline] === ${config.label} (${config.from} → ${config.to}) ===${dryRun ? ' (DRY RUN)' : ''}`,
    );

    if (!skipFetch) {
      const weeks = getWeekRanges(config.from, config.to);
      console.log(`[baseline] ${weeks.length} weeks to process`);

      let totalDocs = 0;
      let totalApiCalls = 0;

      for (const cat of categoriesToProcess) {
        console.log(`\n[baseline] ${cat.key} (${cat.signals.length} signals)`);
        const result = await backfillBaselineCategory(cat.key, cat.signals, weeks, dryRun);
        totalDocs += result.docs;
        totalApiCalls += result.apiCalls;
      }

      console.log(`\n[baseline] Fetch complete: ${totalDocs} docs, ${totalApiCalls} API calls`);
    } else {
      console.log('[baseline] --skip-fetch: skipping API calls, recomputing from existing data');
    }

    // Compute and store baseline statistics
    if (!dryRun) {
      console.log(`[baseline] Computing baseline statistics for ${config.id}...`);
      const baselineResults = await computeBaseline(config);
      await storeBaseline(baselineResults);
      console.log(`[baseline] Stored baselines for ${baselineResults.length} categories`);
    }
  }

  console.log('\n[baseline] Done.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
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
    }
  }

  runBackfillBaseline(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[baseline] Fatal error:', err);
      process.exit(1);
    });
}
