/**
 * CLI: pnpm baselines:compute [--baseline <id>] [--category <key>]
 *
 * Computes baseline statistics from existing weekly_aggregates and document embeddings.
 * No fetching, no AI — reads from document_scores/weekly_aggregates, writes to baselines.
 *
 * As a prerequisite, ensures weekly aggregates exist for all weeks in each baseline period
 * (computes any missing ones from document_scores).
 */

import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import type { BaselineConfig } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import { computeBaseline, storeBaseline } from '@/lib/services/baseline-service';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { checkHelp } from '@/lib/utils/cli-help';
import { getWeekRanges } from '@/lib/utils/date-utils';

interface ComputeBaselineOptions {
  baseline?: string;
  category?: string;
}

/** Ensure weekly aggregates exist for all weeks in a baseline period. */
async function ensureAggregates(config: BaselineConfig, categoryFilter?: string): Promise<number> {
  const weeks = getWeekRanges(config.from, config.to);
  const cats = categoryFilter ? CATEGORIES.filter((c) => c.key === categoryFilter) : CATEGORIES;

  let computed = 0;
  for (const cat of cats) {
    for (const week of weeks) {
      const agg = await computeWeeklyAggregate(cat.key, week.start);
      await storeWeeklyAggregate(agg);
      computed++;
    }
    process.stdout.write(`\r  [${config.id}] Aggregates: ${cat.key} (${weeks.length} weeks)`);
  }
  if (computed > 0) console.log('');
  return computed;
}

async function processBaselineConfig(
  config: BaselineConfig,
  categoryFilter?: string,
): Promise<void> {
  console.log(`\n[baseline-stats] === ${config.label} (${config.from} → ${config.to}) ===`);

  console.log('[baseline-stats] Ensuring weekly aggregates...');
  const aggCount = await ensureAggregates(config, categoryFilter);
  console.log(`[baseline-stats] ${aggCount} aggregate slots ensured`);

  console.log('[baseline-stats] Computing baseline statistics...');
  const results = await computeBaseline(config);

  const filtered = categoryFilter ? results.filter((r) => r.category === categoryFilter) : results;

  if (filtered.length === 0) {
    console.log('[baseline-stats] No data found for baseline computation');
    return;
  }

  await storeBaseline(filtered);

  console.log(`[baseline-stats] Stored baselines for ${filtered.length} categories:`);
  for (const b of filtered) {
    console.log(
      `  ${b.category}: avgSeverity=${b.avgWeeklySeverity.toFixed(2)}, ` +
        `stddev=${b.stddevWeeklySeverity.toFixed(2)}, ` +
        `avgDocs=${b.avgWeeklyDocCount.toFixed(1)}, ` +
        `drift=${b.driftNoiseFloor?.toFixed(4) ?? 'n/a'}`,
    );
  }
}

export async function runComputeBaselineStats(options: ComputeBaselineOptions): Promise<void> {
  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  const configs = options.baseline
    ? BASELINE_CONFIGS.filter((c) => c.id === options.baseline)
    : BASELINE_CONFIGS;

  if (configs.length === 0) {
    const valid = BASELINE_CONFIGS.map((c) => c.id).join(', ');
    throw new Error(`Unknown baseline "${options.baseline}". Available: ${valid}`);
  }

  console.log(`[baseline-stats] Processing ${configs.length} baseline(s)`);
  if (options.category) console.log(`[baseline-stats] Category filter: ${options.category}`);

  for (const config of configs) {
    await processBaselineConfig(config, options.category);
  }

  console.log('\n[baseline-stats] Done.');
}

function parseCliArgs(args: string[]): ComputeBaselineOptions {
  const opts: ComputeBaselineOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--baseline') opts.baseline = args[++i];
    else if (arg === '--category') opts.category = args[++i];
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm baselines:compute [options]

Options:
  --baseline <id>     Compute a specific baseline (e.g. biden_2022)
  --category <key>    Process a single category`,
  );
  runComputeBaselineStats(parseCliArgs(argv))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[baseline-stats] Fatal error:', err);
      process.exit(1);
    });
}
