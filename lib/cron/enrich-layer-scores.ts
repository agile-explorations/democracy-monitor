/**
 * CLI: pnpm layers:enrich [--from <date>] [--to <date>] [--category <key>] [--narratives]
 *
 * Enriches existing weekly aggregates with L1 (structural), L2 (AI summary from
 * stored assessments), L3 (thematic drift), and convergence scores. NO API calls
 * for enrichment — reads L2 data from ai_document_assessments table, computes
 * L1/L3 from DB, and writes enriched results back to weekly_aggregates.
 *
 * With --narratives, generates AI narratives for Elevated+ weeks after enrichment
 * (requires ANTHROPIC_API_KEY).
 */

import { and, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { getAnalysisPeriods, ALL_DATES_WARNING } from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import { aiDocumentAssessments, weeklyAggregates } from '@/lib/db/schema';
import { enrichWithLayerScores } from '@/lib/services/layer-scoring';
import { computeAIAssessmentSummary } from '@/lib/services/layer2-assessment-service';
import type { Pass1Result, Pass2Result } from '@/lib/services/layer2-assessment-service';
import { getBaselineAIFlagRate } from '@/lib/services/layer2-store';
import { storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { WeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { AIAssessmentSummary, ConvergenceSynthesis } from '@/lib/types/structural';
import { checkHelp } from '@/lib/utils/cli-help';

interface EnrichOptions {
  from?: string;
  to?: string;
  category?: string;
  allDates?: boolean;
  narratives?: boolean;
}

/** Build an AIAssessmentSummary from stored ai_document_assessments rows. */
async function buildAISummaryFromDB(
  category: string,
  weekOf: string,
): Promise<AIAssessmentSummary | null> {
  const db = getDb(); // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block

  // Match L2 rows whose week_of falls within the Monday–Sunday window.
  const nextWeek = new Date(weekOf);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().slice(0, 10);

  const weekRange = and(
    eq(aiDocumentAssessments.category, category),
    gte(aiDocumentAssessments.weekOf, weekOf),
    lt(aiDocumentAssessments.weekOf, nextWeekStr),
  );

  const pass1Rows = await db
    .select({
      url: aiDocumentAssessments.url,
      relevant: aiDocumentAssessments.relevant,
      confidence: aiDocumentAssessments.confidence,
      erosionType: aiDocumentAssessments.erosionType,
      signals: aiDocumentAssessments.signals,
      model: aiDocumentAssessments.model,
      provider: aiDocumentAssessments.provider,
    })
    .from(aiDocumentAssessments)
    .where(and(weekRange, eq(aiDocumentAssessments.pass, 1)));

  if (pass1Rows.length === 0) return null;

  const pass2Rows = await db
    .select({
      url: aiDocumentAssessments.url,
      assessment: aiDocumentAssessments.assessment,
      confidence: aiDocumentAssessments.confidence,
      erosionType: aiDocumentAssessments.erosionType,
      signals: aiDocumentAssessments.signals,
      reasoning: aiDocumentAssessments.reasoning,
      comparativeContext: aiDocumentAssessments.comparativeContext,
      citedPassages: aiDocumentAssessments.citedPassages,
      counterArguments: aiDocumentAssessments.counterArguments,
      model: aiDocumentAssessments.model,
      provider: aiDocumentAssessments.provider,
      isAuditSample: aiDocumentAssessments.isAuditSample,
    })
    .from(aiDocumentAssessments)
    .where(and(weekRange, eq(aiDocumentAssessments.pass, 2)));

  const pass1Results: Pass1Result[] = pass1Rows.map((r) => ({
    url: r.url,
    response: {
      relevant: r.relevant ?? false,
      confidence: r.confidence ?? 0,
      erosionType: (r.erosionType ?? 'unclear') as Pass1Result['response']['erosionType'],
      signals: (r.signals as string[]) ?? [],
    },
    meta: { model: r.model, provider: r.provider, tokensInput: 0, tokensOutput: 0, latencyMs: 0 },
  }));

  const pass2Results: Pass2Result[] = pass2Rows.map((r) => ({
    url: r.url,
    isAuditSample: r.isAuditSample ?? false,
    response: {
      assessment: (r.assessment ?? 'routine') as Pass2Result['response']['assessment'],
      confidence: r.confidence ?? 0,
      erosionType: (r.erosionType ?? 'unclear') as Pass2Result['response']['erosionType'],
      signals: (r.signals as string[]) ?? [],
      reasoning: r.reasoning ?? '',
      comparativeContext: r.comparativeContext ?? '',
      citedPassages: (r.citedPassages as string[]) ?? [],
      counterArguments: (r.counterArguments as string[]) ?? [],
    },
    meta: { model: r.model, provider: r.provider, tokensInput: 0, tokensOutput: 0, latencyMs: 0 },
  }));

  const pass1Model = pass1Rows[0]?.model ?? 'unknown';
  const pass2Model = pass2Rows[0]?.model ?? 'unknown';
  const baseline = await getBaselineAIFlagRate(category, 'biden_2022');

  return computeAIAssessmentSummary(
    pass1Results,
    pass2Results,
    baseline?.rate ?? 0,
    baseline?.stdDev ?? 0,
    pass1Model,
    pass2Model,
  );
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
    await storeWeeklyAggregate(result);
    enriched++;
    catCounts[agg.category] = (catCounts[agg.category] || 0) + 1;

    const detail = result.convergenceDetail as ConvergenceSynthesis | undefined;
    if (detail && ELEVATED_STATUSES.has(detail.status)) {
      elevatedWeeks.add(agg.weekOf);
    }

    if (enriched % 100 === 0) {
      process.stdout.write(`\r[layers:enrich] ${enriched}/${aggregates.length} enriched`);
    }
  }

  return { enriched, skippedNoL2, catCounts, elevatedWeeks };
}

async function run(options: EnrichOptions): Promise<void> {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  if (!isDbAvailable()) {
    console.error('[layers:enrich] DATABASE_URL not configured');
    process.exit(1);
  }

  const cats = options.category ? CATEGORIES.filter((c) => c.key === options.category) : CATEGORIES;
  if (cats.length === 0) {
    console.error(`[layers:enrich] Unknown category: ${options.category}`);
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
    console.log(`[layers:enrich] Defaulting to ${periods.length} analysis periods`);

    for (const period of periods) {
      console.log(`\n[layers:enrich] === ${period.label} (${period.from} → ${period.to}) ===`);
      const aggregates = await loadAggregates({ ...options, from: period.from, to: period.to });
      if (aggregates.length === 0) continue;
      console.log(`[layers:enrich] ${aggregates.length} aggregates to enrich`);

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
    console.log('[layers:enrich] Loading weekly aggregates...');
    const aggregates = await loadAggregates(options);
    console.log(`[layers:enrich] ${aggregates.length} aggregates to enrich`);

    const { enriched, skippedNoL2, catCounts, elevatedWeeks } = await enrichAggregates(aggregates);
    totalEnriched = enriched;
    totalSkippedNoL2 = skippedNoL2;
    Object.assign(allCatCounts, catCounts);
    elevatedWeeks.forEach((w) => allElevatedWeeks.add(w));
  }

  console.log(`\n[layers:enrich] ${totalEnriched} total enriched`);
  console.log(
    `[layers:enrich] ${totalSkippedNoL2} weeks had no L2 data (L1/L3/convergence still computed)`,
  );
  console.log('[layers:enrich] Per category:');
  for (const [cat, count] of Object.entries(allCatCounts).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${cat}: ${count} weeks`);
  }

  if (options.narratives) {
    const { generateNarrativesForWeek } = await import('@/lib/services/narrative-pipeline');
    const sortedWeeks = Array.from(allElevatedWeeks).sort();
    console.log(`\n[layers:enrich] Generating narratives for ${sortedWeeks.length} elevated weeks`);
    let narrated = 0;
    for (const weekOf of sortedWeeks) {
      try {
        await generateNarrativesForWeek(weekOf);
        narrated++;
      } catch (err) {
        console.error(`[layers:enrich] Narrative failed for ${weekOf}:`, err);
      }
    }
    console.log(`[layers:enrich] ${narrated}/${sortedWeeks.length} narrative weeks completed`);
  }
}

/* CLI entry */
if (require.main === module) {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm layers:enrich [options]

Options:
  --from <date>       Start date (YYYY-MM-DD)
  --to <date>         End date (YYYY-MM-DD)
  --category <key>    Process a single category
  --all-dates         Process all dates (default: analysis periods only)
  --narratives        Generate AI narratives for Elevated+ weeks after enrichment`,
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
    }
  }

  run(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[layers:enrich] Fatal:', err);
      process.exit(1);
    });
}
