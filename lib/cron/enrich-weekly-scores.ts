/**
 * CLI: pnpm scores:enrich [--from <date>] [--to <date>] [--category <key>] [--narratives]
 *
 * Enriches existing weekly aggregates with L1 (structural), L2 (AI summary from
 * stored assessments), L3 (thematic drift), and convergence scores. NO API calls
 * for enrichment — reads L2 data from ai_document_assessments table, computes
 * L1/L3 from DB, and writes enriched results back to weekly_aggregates.
 *
 * With --narratives, generates AI narratives for Elevated+ weeks after enrichment
 * (requires ANTHROPIC_API_KEY).
 */

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import {
  getAnalysisPeriods,
  ALL_DATES_WARNING,
  T2_INAUGURATION,
} from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import { buildAISummaryFromDB } from '@/lib/services/document-review-summary';
import { storeEnrichedWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { WeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { enrichWithLayerScores } from '@/lib/services/weekly-enrichment';
import type { ConcernAssessment } from '@/lib/types/structural';
import { checkHelp } from '@/lib/utils/cli-help';

interface EnrichOptions {
  from?: string;
  to?: string;
  category?: string;
  allDates?: boolean;
  narratives?: boolean;
  cleanNarratives?: boolean;
}

/** Load existing weekly aggregates from DB as WeeklyAggregate objects. */
async function loadAggregates(options: EnrichOptions): Promise<WeeklyAggregate[]> {
  const db = getDb(); // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block
  const conditions = [];
  if (options.category) conditions.push(eq(weeklyAggregates.category, options.category));
  if (options.from) conditions.push(gte(weeklyAggregates.weekOf, options.from));
  if (options.to) conditions.push(lte(weeklyAggregates.weekOf, options.to));

  const rows = await db
    .select()
    .from(weeklyAggregates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(weeklyAggregates.category, weeklyAggregates.weekOf);

  return rows.map((r) => ({
    category: r.category,
    weekOf: r.weekOf,
    totalSeverity: Number(r.totalSeverity),
    documentCount: r.documentCount,
    avgSeverityPerDoc: Number(r.avgSeverityPerDoc),
    captureProportion: Number(r.captureProportion),
    driftProportion: Number(r.driftProportion),
    warningProportion: Number(r.warningProportion),
    severityMix: Number(r.severityMix),
    captureMatchCount: r.captureMatchCount,
    driftMatchCount: r.driftMatchCount,
    warningMatchCount: r.warningMatchCount,
    suppressedMatchCount: r.suppressedMatchCount,
    topKeywords: (r.topKeywords as string[]) ?? [],
    structuralScore: r.structuralScore != null ? Number(r.structuralScore) : undefined,
    structuralDetail: (r.structuralDetail as unknown) ?? undefined,
    thematicScore: r.thematicScore != null ? Number(r.thematicScore) : undefined,
    thematicDetail: (r.thematicDetail as unknown) ?? undefined,
    convergenceScore: r.convergenceScore != null ? Number(r.convergenceScore) : undefined,
    convergenceDetail: (r.convergenceDetail as unknown) ?? undefined,
    aiScore: r.aiScore != null ? Number(r.aiScore) : undefined,
    aiDetail: (r.aiDetail as unknown) ?? undefined,
    computedAt: (r.computedAt ?? new Date()).toISOString(),
  }));
}

const ELEVATED_STATUSES = new Set(['Elevated', 'Divergent', 'ConfirmedConcern']);

async function enrichAggregates(aggregates: WeeklyAggregate[]): Promise<{
  enriched: number;
  skippedNoL2: number;
  catCounts: Record<string, number>;
  elevatedWeeks: Set<string>;
}> {
  let enriched = 0;
  let skippedNoL2 = 0;
  const catCounts: Record<string, number> = {};
  const elevatedWeeks = new Set<string>();

  for (const agg of aggregates) {
    const aiSummary = await buildAISummaryFromDB(agg.category, agg.weekOf);
    if (!aiSummary) skippedNoL2++;

    const result = await enrichWithLayerScores(agg, aiSummary);
    await storeEnrichedWeeklyAggregate(result);
    enriched++;
    catCounts[agg.category] = (catCounts[agg.category] || 0) + 1;

    const detail = result.convergenceDetail as ConcernAssessment | undefined;
    if (detail && ELEVATED_STATUSES.has(detail.status)) {
      elevatedWeeks.add(agg.weekOf);
    }

    if (enriched % 100 === 0) {
      process.stdout.write(`\r[scores:enrich] ${enriched}/${aggregates.length} enriched`);
    }
  }

  process.stdout.write(`\r[scores:enrich] ${enriched}/${aggregates.length} enriched\n`);

  return { enriched, skippedNoL2, catCounts, elevatedWeeks };
}

async function run(options: EnrichOptions): Promise<void> {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  if (!isDbAvailable()) {
    console.error('[scores:enrich] DATABASE_URL not configured');
    process.exit(1);
  }

  const cats = options.category ? CATEGORIES.filter((c) => c.key === options.category) : CATEGORIES;
  if (cats.length === 0) {
    console.error(`[scores:enrich] Unknown category: ${options.category}`);
    process.exit(1);
  }

  if (options.allDates) console.warn(ALL_DATES_WARNING);

  const hasDateArgs = !!(options.from || options.to);
  const useAnalysisPeriods = !hasDateArgs && !options.allDates;

  let totalEnriched = 0;
  let totalSkippedNoL2 = 0;
  const allCatCounts: Record<string, number> = {};
  const allElevatedWeeks = new Set<string>();

  if (useAnalysisPeriods) {
    const periods = getAnalysisPeriods();
    console.log(`[scores:enrich] Defaulting to ${periods.length} analysis periods`);

    for (const period of periods) {
      console.log(`\n[scores:enrich] === ${period.label} (${period.from} → ${period.to}) ===`);
      const aggregates = await loadAggregates({ ...options, from: period.from, to: period.to });
      if (aggregates.length === 0) continue;
      console.log(`[scores:enrich] ${aggregates.length} aggregates to enrich`);

      const { enriched, skippedNoL2, catCounts, elevatedWeeks } =
        await enrichAggregates(aggregates);
      totalEnriched += enriched;
      totalSkippedNoL2 += skippedNoL2;
      for (const [cat, count] of Object.entries(catCounts)) {
        allCatCounts[cat] = (allCatCounts[cat] || 0) + count;
      }
      elevatedWeeks.forEach((w) => allElevatedWeeks.add(w));
    }
  } else {
    console.log('[scores:enrich] Loading weekly aggregates...');
    const aggregates = await loadAggregates(options);
    console.log(`[scores:enrich] ${aggregates.length} aggregates to enrich`);

    const { enriched, skippedNoL2, catCounts, elevatedWeeks } = await enrichAggregates(aggregates);
    totalEnriched = enriched;
    totalSkippedNoL2 = skippedNoL2;
    Object.assign(allCatCounts, catCounts);
    elevatedWeeks.forEach((w) => allElevatedWeeks.add(w));
  }

  console.log(`\n[scores:enrich] ${totalEnriched} total enriched`);
  console.log(
    `[scores:enrich] ${totalSkippedNoL2} weeks had no L2 data (L1/L3/convergence still computed)`,
  );
  console.log('[scores:enrich] Per category:');
  for (const [cat, count] of Object.entries(allCatCounts).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${cat}: ${count} weeks`);
  }

  if (options.narratives) {
    const { generateNarrativesForWeek } = await import('@/lib/services/narrative-pipeline');

    if (options.cleanNarratives) {
      // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block
      const db = getDb();
      const result = await db.execute(sql`DELETE FROM narratives`);
      const deleted = (result as unknown as { rowCount?: number })?.rowCount ?? 'unknown';
      console.log(`\n[scores:enrich] --clean: deleted ${deleted} existing narratives`);
    }

    // Only generate narratives for Trump T2 — baseline periods are historical reference data
    const sortedWeeks = Array.from(allElevatedWeeks)
      .filter((w) => w >= T2_INAUGURATION)
      .sort();
    console.log(`\n[scores:enrich] Generating narratives for ${sortedWeeks.length} elevated weeks`);
    let narrated = 0;
    for (const weekOf of sortedWeeks) {
      try {
        await generateNarrativesForWeek(weekOf);
        narrated++;
      } catch (err) {
        console.error(`[scores:enrich] Narrative failed for ${weekOf}:`, err);
      }
    }
    console.log(`[scores:enrich] ${narrated}/${sortedWeeks.length} narrative weeks completed`);
  }
}

/* CLI entry */
if (require.main === module) {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm scores:enrich [options]

Options:
  --from <date>       Start date (YYYY-MM-DD)
  --to <date>         End date (YYYY-MM-DD)
  --category <key>    Process a single category
  --all-dates         Process all dates (default: analysis periods only)
  --narratives        Generate AI narratives for Elevated+ weeks after enrichment
  --clean             Delete all existing narratives before generating (use with --narratives)`,
  );
  const options: EnrichOptions = {};

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
      case '--all-dates':
        options.allDates = true;
        break;
      case '--narratives':
        options.narratives = true;
        break;
      case '--clean':
        options.cleanNarratives = true;
        break;
    }
  }

  run(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[scores:enrich] Fatal:', err);
      process.exit(1);
    });
}
