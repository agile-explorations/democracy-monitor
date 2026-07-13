import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  aiDocumentAssessments,
  documents,
  documentScores,
  weeklyAggregates,
} from '@/lib/db/schema';
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

interface ScoredDocRow {
  url: string;
  title: string | null;
  documentClass: string;
  classMultiplier: number;
  severityScore: number;
  finalScore: number;
  captureCount: number;
  driftCount: number;
  warningCount: number;
  matches: unknown[];
  suppressed: unknown[];
  p1Relevant: boolean | null;
  p2Assessment: string | null;
  p2ErosionType: string | null;
  p2ErosionActor: string | null;
  p2Reasoning: string | null;
}

function toDocumentExplanation(row: ScoredDocRow): DocumentExplanation {
  const explained = explainDocumentScore({
    url: row.url,
    title: row.title ?? undefined,
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
  if (row.p1Relevant != null) {
    explained.ai = {
      flagged: row.p1Relevant === true,
      assessment: row.p2Assessment ?? null,
      erosionType: row.p2ErosionType ?? null,
      erosionActor: row.p2ErosionActor ?? null,
      reasoning: row.p2Reasoning ?? null,
    };
  }
  return explained;
}

/** Fetch top N scored documents for a category+week, joining documents table for titles. */
async function fetchTopScoredDocuments(
  category: string,
  weekOf: string,
  topN: number,
): Promise<DocumentExplanation[]> {
  const db = getDb();
  const p1 = alias(aiDocumentAssessments, 'p1');
  const p2 = alias(aiDocumentAssessments, 'p2');
  const rows = await db
    .select({
      url: documentScores.url,
      title: sql<string>`${documents.title}`.as('doc_title'),
      documentClass: documentScores.documentClass,
      classMultiplier: documentScores.classMultiplier,
      severityScore: documentScores.severityScore,
      finalScore: documentScores.finalScore,
      captureCount: documentScores.captureCount,
      driftCount: documentScores.driftCount,
      warningCount: documentScores.warningCount,
      matches: documentScores.matches,
      suppressed: documentScores.suppressed,
      p1Relevant: p1.relevant,
      p2Assessment: p2.assessment,
      p2ErosionType: p2.erosionType,
      p2ErosionActor: p2.erosionActor,
      p2Reasoning: p2.reasoning,
    })
    .from(documentScores)
    .leftJoin(
      documents,
      and(eq(documentScores.url, documents.url), eq(documentScores.category, documents.category)),
    )
    .leftJoin(
      p1,
      and(eq(documentScores.url, p1.url), eq(documentScores.category, p1.category), eq(p1.pass, 1)),
    )
    .leftJoin(
      p2,
      and(eq(documentScores.url, p2.url), eq(documentScores.category, p2.category), eq(p2.pass, 2)),
    )
    .where(and(eq(documentScores.category, category), eq(documentScores.weekOf, weekOf)))
    .orderBy(desc(documentScores.finalScore))
    .limit(topN);

  return rows.map(toDocumentExplanation);
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

  const [agg] = await db
    .select()
    .from(weeklyAggregates)
    .where(and(eq(weeklyAggregates.category, category), eq(weeklyAggregates.weekOf, resolvedWeek)))
    .limit(1);

  if (!agg) return null;

  const topDocuments = await fetchTopScoredDocuments(category, resolvedWeek, topN);

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
