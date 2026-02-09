import { and, desc, eq } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { documentScores, weeklyAggregates } from '@/lib/db/schema';
import {
  AUTHORITY_COUNT_MAX,
  CLASS_MULTIPLIERS,
  DATA_COVERAGE_WEIGHTS,
  DECAY_HALF_LIFE_WEEKS,
  EVIDENCE_COUNT_MAX,
  KEYWORD_DENSITY_RATIO,
  NEGATION_WINDOW_AFTER,
  NEGATION_WINDOW_BEFORE,
  SOURCE_DIVERSITY_MAX,
  TIER_WEIGHTS,
} from '@/lib/methodology/scoring-config';
import { getWeekOfDate } from '@/lib/services/weekly-aggregator';
import type {
  ConfigSnapshot,
  DocumentExplanation,
  TierBreakdown,
  WeekExplanation,
} from '@/lib/types/explanation';
import type { KeywordMatch, SuppressedMatch } from '@/lib/types/scoring';

/** Build a snapshot of current scoring configuration. */
export function getConfigSnapshot(): ConfigSnapshot {
  return {
    tierWeights: { ...TIER_WEIGHTS },
    classMultipliers: { ...CLASS_MULTIPLIERS },
    dataCoverageWeights: { ...DATA_COVERAGE_WEIGHTS },
    decayHalfLifeWeeks: DECAY_HALF_LIFE_WEEKS,
    negationWindowBefore: NEGATION_WINDOW_BEFORE,
    negationWindowAfter: NEGATION_WINDOW_AFTER,
    sourceDiversityMax: SOURCE_DIVERSITY_MAX,
    authorityCountMax: AUTHORITY_COUNT_MAX,
    evidenceCountMax: EVIDENCE_COUNT_MAX,
    keywordDensityRatio: KEYWORD_DENSITY_RATIO,
  };
}

/**
 * Build a DocumentExplanation from a document_scores DB row.
 * Pure function — no DB access needed.
 */
export function explainDocumentScore(row: {
  url: string;
  title?: string;
  documentClass: string;
  classMultiplier: number;
  severityScore: number;
  finalScore: number;
  captureCount: number;
  driftCount: number;
  warningCount: number;
  matches: unknown;
  suppressed: unknown;
}): DocumentExplanation {
  const matches = (row.matches ?? []) as KeywordMatch[];
  const suppressed = (row.suppressed ?? []) as SuppressedMatch[];

  const tiers: Array<{ tier: 'capture' | 'drift' | 'warning'; count: number }> = [
    { tier: 'capture', count: row.captureCount },
    { tier: 'drift', count: row.driftCount },
    { tier: 'warning', count: row.warningCount },
  ];

  const tierBreakdown: TierBreakdown[] = tiers.map(({ tier, count }) => {
    const weight = TIER_WEIGHTS[tier];
    const contribution = tier === 'capture' ? weight * Math.log2(count + 1) : count * weight;
    return { tier, count, weight, contribution };
  });

  // Build human-readable formula
  const capturePart = `${TIER_WEIGHTS.capture} * log2(${row.captureCount}+1)`;
  const driftPart = `${row.driftCount}*${TIER_WEIGHTS.drift}`;
  const warningPart = `${row.warningCount}*${TIER_WEIGHTS.warning}`;
  const severityRounded = Number(row.severityScore.toFixed(2));
  const finalRounded = Number(row.finalScore.toFixed(2));
  const formula =
    `${capturePart} + ${driftPart} + ${warningPart} = ${severityRounded}; ` +
    `final = ${severityRounded} * ${row.classMultiplier} = ${finalRounded}`;

  return {
    url: row.url,
    title: row.title ?? '(untitled)',
    documentClass: row.documentClass as DocumentExplanation['documentClass'],
    classMultiplier: row.classMultiplier,
    severityScore: row.severityScore,
    finalScore: row.finalScore,
    formula,
    tierBreakdown,
    matches,
    suppressed,
  };
}

/** Look up a document score by URL and return its explanation. */
export async function getDocumentExplanation(url: string): Promise<DocumentExplanation | null> {
  if (!isDbAvailable()) return null;

  const db = getDb();
  const [row] = await db.select().from(documentScores).where(eq(documentScores.url, url)).limit(1);

  if (!row) return null;

  return explainDocumentScore({
    url: row.url,
    title: undefined, // title not stored in document_scores table
    documentClass: row.documentClass,
    classMultiplier: row.classMultiplier,
    severityScore: row.severityScore,
    finalScore: row.finalScore,
    captureCount: row.captureCount,
    driftCount: row.driftCount,
    warningCount: row.warningCount,
    matches: row.matches,
    suppressed: row.suppressed,
  });
}

/** Explain a week's aggregate for a category, including top N documents. */
export async function getWeekExplanation(
  category: string,
  weekOf?: string,
  topN: number = 5,
): Promise<WeekExplanation | null> {
  if (!isDbAvailable()) return null;

  const resolvedWeek = weekOf ?? getWeekOfDate();
  const db = getDb();

  // Fetch weekly aggregate
  const [agg] = await db
    .select()
    .from(weeklyAggregates)
    .where(and(eq(weeklyAggregates.category, category), eq(weeklyAggregates.weekOf, resolvedWeek)))
    .limit(1);

  if (!agg) return null;

  // Fetch top N documents by finalScore for this category+week
  const topDocs = await db
    .select()
    .from(documentScores)
    .where(and(eq(documentScores.category, category), eq(documentScores.weekOf, resolvedWeek)))
    .orderBy(desc(documentScores.finalScore))
    .limit(topN);

  const topDocuments = topDocs.map((row) =>
    explainDocumentScore({
      url: row.url,
      documentClass: row.documentClass,
      classMultiplier: row.classMultiplier,
      severityScore: row.severityScore,
      finalScore: row.finalScore,
      captureCount: row.captureCount,
      driftCount: row.driftCount,
      warningCount: row.warningCount,
      matches: row.matches,
      suppressed: row.suppressed,
    }),
  );

  return {
    category,
    weekOf: resolvedWeek,
    totalSeverity: agg.totalSeverity,
    documentCount: agg.documentCount,
    avgSeverityPerDoc: agg.avgSeverityPerDoc,
    tierProportions: {
      capture: agg.captureProportion,
      drift: agg.driftProportion,
      warning: agg.warningProportion,
    },
    topDocuments,
    topKeywords: (agg.topKeywords as string[]) ?? [],
    configSnapshot: getConfigSnapshot(),
  };
}
