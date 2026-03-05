/**
 * CLI: pnpm enrich-layers [--from <date>] [--to <date>] [--category <key>]
 *
 * Enriches existing weekly aggregates with L1 (structural), L2 (AI summary from
 * stored assessments), L3 (thematic drift), and convergence scores. NO API calls —
 * reads L2 data from ai_document_assessments table, computes L1/L3 from DB, and
 * writes enriched results back to weekly_aggregates.
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
import type { AIAssessmentSummary } from '@/lib/types/structural';

interface EnrichOptions {
  from?: string;
  to?: string;
  category?: string;
  allDates?: boolean;
}

/** Build an AIAssessmentSummary from stored ai_document_assessments rows. */
async function buildAISummaryFromDB(
  category: string,
  weekOf: string,
): Promise<AIAssessmentSummary | null> {
  const db = getDb(); // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block

  // L2 week_of uses a different anchor (Friday) than aggregates (Monday).
  // Match any L2 rows whose week_of falls within the Monday–Sunday window.
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

async function enrichAggregates(aggregates: WeeklyAggregate[]): Promise<{
  enriched: number;
  skippedNoL2: number;
  catCounts: Record<string, number>;
}> {
  let enriched = 0;
  let skippedNoL2 = 0;
  const catCounts: Record<string, number> = {};

  for (const agg of aggregates) {
    const aiSummary = await buildAISummaryFromDB(agg.category, agg.weekOf);
    if (!aiSummary) skippedNoL2++;

    const result = await enrichWithLayerScores(agg, aiSummary);
    await storeWeeklyAggregate(result);
    enriched++;
    catCounts[agg.category] = (catCounts[agg.category] || 0) + 1;

    if (enriched % 100 === 0) {
      process.stdout.write(`\r[enrich-layers] ${enriched}/${aggregates.length} enriched`);
    }
  }

  return { enriched, skippedNoL2, catCounts };
}

async function run(options: EnrichOptions): Promise<void> {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  if (!isDbAvailable()) {
    console.error('[enrich-layers] DATABASE_URL not configured');
    process.exit(1);
  }

  const cats = options.category ? CATEGORIES.filter((c) => c.key === options.category) : CATEGORIES;
  if (cats.length === 0) {
    console.error(`[enrich-layers] Unknown category: ${options.category}`);
    process.exit(1);
  }

  if (options.allDates) console.warn(ALL_DATES_WARNING);

  const hasDateArgs = !!(options.from || options.to);
  const useAnalysisPeriods = !hasDateArgs && !options.allDates;

  let totalEnriched = 0;
  let totalSkippedNoL2 = 0;
  const allCatCounts: Record<string, number> = {};

  if (useAnalysisPeriods) {
    const periods = getAnalysisPeriods();
    console.log(`[enrich-layers] Defaulting to ${periods.length} analysis periods`);

    for (const period of periods) {
      console.log(`\n[enrich-layers] === ${period.label} (${period.from} → ${period.to}) ===`);
      const aggregates = await loadAggregates({ ...options, from: period.from, to: period.to });
      if (aggregates.length === 0) continue;
      console.log(`[enrich-layers] ${aggregates.length} aggregates to enrich`);

      const { enriched, skippedNoL2, catCounts } = await enrichAggregates(aggregates);
      totalEnriched += enriched;
      totalSkippedNoL2 += skippedNoL2;
      for (const [cat, count] of Object.entries(catCounts)) {
        allCatCounts[cat] = (allCatCounts[cat] || 0) + count;
      }
    }
  } else {
    console.log('[enrich-layers] Loading weekly aggregates...');
    const aggregates = await loadAggregates(options);
    console.log(`[enrich-layers] ${aggregates.length} aggregates to enrich`);

    const { enriched, skippedNoL2, catCounts } = await enrichAggregates(aggregates);
    totalEnriched = enriched;
    totalSkippedNoL2 = skippedNoL2;
    Object.assign(allCatCounts, catCounts);
  }

  console.log(`\n[enrich-layers] ${totalEnriched} total enriched`);
  console.log(
    `[enrich-layers] ${totalSkippedNoL2} weeks had no L2 data (L1/L3/convergence still computed)`,
  );
  console.log('[enrich-layers] Per category:');
  for (const [cat, count] of Object.entries(allCatCounts).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${cat}: ${count} weeks`);
  }
}

/* CLI entry */
if (require.main === module) {
  const args = process.argv.slice(2);
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
    }
  }

  run(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[enrich-layers] Fatal:', err);
      process.exit(1);
    });
}
