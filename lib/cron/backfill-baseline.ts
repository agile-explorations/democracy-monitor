/** CLI: pnpm build-baseline [--baseline X] [--category X] [--dry-run] [--skip-fetch] [--skip-ai] [--model X] [--no-rhetoric] [--rhetoric-only] */

import { assessWeek } from '@/lib/cron/assess-week';
import type { AiOptions } from '@/lib/cron/assess-week';
import { backfillRhetoric } from '@/lib/cron/backfill-rhetoric';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import { computeBaseline, getBaselineConfig, storeBaseline } from '@/lib/services/baseline-service';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { getDocumentHistory, storeDocuments } from '@/lib/services/document-store';
import {
  fetchFederalRegisterHistorical,
  parseSignalParams,
} from '@/lib/services/federal-register-fetcher';
import { aggregateAllAreas } from '@/lib/services/intent-weekly-aggregator';
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
  rhetoricOnly?: boolean;
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

async function fetchBaselineData(
  categoriesToProcess: typeof CATEGORIES,
  weeks: Array<{ start: string; end: string }>,
  dryRun: boolean,
  includeRhetoric: boolean,
  rhetoricOnly: boolean,
  aiOptions: AiOptions,
): Promise<void> {
  console.log(`[baseline] ${weeks.length} weeks to process`);

  let totalDocs = 0;
  let totalApiCalls = 0;

  if (!rhetoricOnly) {
    for (const cat of categoriesToProcess) {
      console.log(`\n[baseline] ${cat.key} (${cat.signals.length} signals)`);
      const result = await backfillBaselineCategory(cat.key, cat.signals, weeks, dryRun, aiOptions);
      totalDocs += result.docs;
      totalApiCalls += result.apiCalls;
    }
  }

  if (includeRhetoric || rhetoricOnly) {
    const rhetoric = await backfillRhetoric(weeks, dryRun);
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
}

async function reassessFromDb(
  categoriesToProcess: typeof CATEGORIES,
  weeks: Array<{ start: string; end: string }>,
  aiOptions: AiOptions,
): Promise<void> {
  for (const cat of categoriesToProcess) {
    console.log(`\n[baseline] Reassessing ${cat.key}...`);
    let weeksDone = 0;
    for (const week of weeks) {
      const rows = await getDocumentHistory(cat.key, {
        from: week.start,
        to: week.end,
        limit: 5000,
      });
      const items: ContentItem[] = rows.map((r) => ({
        title: r.title,
        link: r.url ?? undefined,
        type: r.sourceType,
      }));
      if (items.length > 0) {
        const enhanced = await assessWeek(items, cat.key, week.end, aiOptions);
        await saveSnapshot(enhanced, new Date(week.end));
      }
      weeksDone++;
      process.stdout.write(
        `\r  [${cat.key}] ${week.start}: ${items.length} docs (${weeksDone}/${weeks.length})`,
      );
    }
    console.log('');
  }
}

async function processBaselineConfig(
  config: (typeof BASELINE_CONFIGS)[number],
  categoriesToProcess: typeof CATEGORIES,
  dryRun: boolean,
  skipFetch: boolean,
  includeRhetoric: boolean,
  rhetoricOnly: boolean,
  aiOptions: AiOptions,
): Promise<void> {
  console.log(
    `\n[baseline] === ${config.label} (${config.from} → ${config.to}) ===${dryRun ? ' (DRY RUN)' : ''}`,
  );

  const weeks = getWeekRanges(config.from, config.to);

  if (!skipFetch) {
    await fetchBaselineData(
      categoriesToProcess,
      weeks,
      dryRun,
      includeRhetoric,
      rhetoricOnly,
      aiOptions,
    );
  } else if (!dryRun) {
    await reassessFromDb(categoriesToProcess, weeks, aiOptions);
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
  const rhetoricOnly = options.rhetoricOnly ?? false;
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
      rhetoricOnly,
      aiOptions,
    );
  }

  console.log('\n[baseline] Done.');
}

function parseCliArgs(args: string[]): BackfillBaselineOptions {
  const options: BackfillBaselineOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--baseline') options.baseline = args[++i];
    else if (arg === '--category') options.category = args[++i];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-fetch') options.skipFetch = true;
    else if (arg === '--no-rhetoric') options.includeRhetoric = false;
    else if (arg === '--rhetoric-only') options.rhetoricOnly = true;
    else if (arg === '--skip-ai') options.skipAi = true;
    else if (arg === '--model') options.model = args[++i];
  }
  return options;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  runBackfillBaseline(parseCliArgs(process.argv.slice(2)))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[baseline] Fatal error:', err);
      process.exit(1);
    });
}
