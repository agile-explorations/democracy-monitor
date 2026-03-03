/** Pure query functions for backfill completeness verification. */

import { eq, sql, isNull, and, gte, lt, inArray } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import {
  documents,
  documentScores,
  weeklyAggregates,
  baselines,
  aiDocumentAssessments,
} from '@/lib/db/schema';

export interface DocumentCoverage {
  category: string;
  sourceOrigin: string;
  count: number;
}

export interface StageCompleteness {
  totalDocuments: number;
  missingScores: number;
  missingEmbeddings: number;
  totalWeeks: number;
  missingAggregates: number;
}

export interface BaselineCompleteness {
  baselineId: string;
  category: string;
  hasStats: boolean;
}

export interface Layer2PeriodStats {
  period: string;
  label: string;
  totalDocuments: number;
  pass1Assessed: number;
  missingPass1: number;
  pass1Flagged: number;
  pass2Flagged: number;
  missingPass2: number;
  auditSampled: number;
  auditFalseNegatives: number;
}

export type Layer2Completeness = Layer2PeriodStats[];

export interface PaginationFitness {
  category: string;
  sourceOrigin: string;
  peakWeeklyCount: number;
}

export interface ClOpinionCoverage {
  docketEntries: number;
  opinionDocuments: number;
  uniqueCases: number;
  casesWithOpinion: number;
  casesWithoutOpinion: number;
}

export interface SourcePeriodCoverage {
  category: string;
  sourceOrigin: string;
  period: string;
  count: number;
}

export interface ContentCompleteness {
  sourceType: string;
  total: number;
  nullContent: number;
}

/** Source types where content can be backfilled via `pnpm backfill:content`. */
export const CONTENT_FIXABLE_TYPES = new Set(['Presidential Document', 'congressional_report']);

export async function getContentCompleteness(category?: string): Promise<ContentCompleteness[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const catFilter = category ? eq(documents.category, category) : undefined;

  const rows = await db
    .select({
      sourceType: documents.sourceType,
      total: sql<number>`count(*)::int`,
      nullContent: sql<number>`count(*) filter (where ${documents.content} is null)::int`,
    })
    .from(documents)
    .where(catFilter)
    .groupBy(documents.sourceType)
    .orderBy(sql`count(*) filter (where ${documents.content} is null) desc`);

  return rows
    .filter((r) => Number(r.nullContent) > 0)
    .map((r) => ({
      sourceType: r.sourceType,
      total: Number(r.total),
      nullContent: Number(r.nullContent),
    }));
}

export async function getDocumentCoverage(category?: string): Promise<DocumentCoverage[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const catFilter = category ? eq(documents.category, category) : undefined;
  const rows = await db
    .select({
      category: documents.category,
      sourceOrigin: sql<string>`coalesce(${documents.sourceOrigin}, 'unknown')`,
      count: sql<number>`count(*)::int`,
    })
    .from(documents)
    .where(catFilter)
    .groupBy(documents.category, documents.sourceOrigin)
    .orderBy(documents.category, documents.sourceOrigin);

  return rows.map((r) => ({
    category: r.category,
    sourceOrigin: r.sourceOrigin,
    count: Number(r.count),
  }));
}

export async function getStageCompleteness(category?: string): Promise<StageCompleteness> {
  if (!isDbAvailable()) {
    return {
      totalDocuments: 0,
      missingScores: 0,
      missingEmbeddings: 0,
      totalWeeks: 0,
      missingAggregates: 0,
    };
  }
  const db = getDb();
  const catFilter = category ? eq(documents.category, category) : undefined;

  const [docStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      missingEmbeddings: sql<number>`count(*) filter (where ${documents.embeddedAt} is null)::int`,
    })
    .from(documents)
    .where(catFilter);

  const [scoreStats] = await db
    .select({
      missingScores: sql<number>`count(*)::int`,
    })
    .from(documents)
    .leftJoin(documentScores, eq(documents.url, documentScores.url))
    .where(catFilter ? and(catFilter, isNull(documentScores.id)) : isNull(documentScores.id));

  const scoreCatFilter = category ? eq(documentScores.category, category) : undefined;
  const aggCatFilter = category ? eq(weeklyAggregates.category, category) : undefined;
  const [weekStats] = await db
    .select({
      totalWeeks: sql<number>`count(distinct (${documentScores.category}, ${documentScores.weekOf}))::int`,
    })
    .from(documentScores)
    .where(scoreCatFilter);

  const [aggStats] = await db
    .select({
      aggWeeks: sql<number>`count(*)::int`,
    })
    .from(weeklyAggregates)
    .where(aggCatFilter);

  return {
    totalDocuments: Number(docStats.total),
    missingScores: Number(scoreStats.missingScores),
    missingEmbeddings: Number(docStats.missingEmbeddings),
    totalWeeks: Number(weekStats.totalWeeks),
    missingAggregates: Math.max(0, Number(weekStats.totalWeeks) - Number(aggStats.aggWeeks)),
  };
}

export async function getBaselineCompleteness(): Promise<BaselineCompleteness[]> {
  if (!isDbAvailable()) return [];
  const rows = await getDb()
    .select({
      baselineId: baselines.baselineId,
      category: baselines.category,
    })
    .from(baselines)
    .orderBy(baselines.baselineId, baselines.category);

  return rows.map((r) => ({
    baselineId: r.baselineId,
    category: r.category,
    hasStats: true,
  }));
}

const L2_PERIODS = [
  ...BASELINE_CONFIGS.map((c) => ({ id: c.id, label: c.label, from: c.from, to: c.to })),
  { id: 'trump_t2', label: 'Trump T2 (2025–)', from: '2025-01-20', to: '2030-01-01' },
];

const MONITORING_KEYS = CATEGORIES.map((c) => c.key);

function buildL2Filters(from: string, to: string, category?: string) {
  return {
    dateFilter: and(
      gte(documents.publishedAt, new Date(from)),
      lt(documents.publishedAt, new Date(to)),
    ),
    aiDateFilter: and(
      sql`${aiDocumentAssessments.weekOf} >= ${from}`,
      sql`${aiDocumentAssessments.weekOf} < ${to}`,
    ),
    catFilter: category
      ? eq(documents.category, category)
      : inArray(documents.category, MONITORING_KEYS),
    catAiFilter: category
      ? eq(aiDocumentAssessments.category, category)
      : inArray(aiDocumentAssessments.category, MONITORING_KEYS),
  };
}

/** Query per-category L2 counts for a date range, returned as Maps keyed by category. */
async function queryL2CountsByCategory(from: string, to: string, category?: string) {
  const db = getDb();
  const { dateFilter, aiDateFilter, catFilter, catAiFilter } = buildL2Filters(from, to, category);

  const docRows = await db
    .select({
      category: documents.category,
      total: sql<number>`count(distinct ${documents.url})::int`,
    })
    .from(documents)
    .where(and(dateFilter, catFilter))
    .groupBy(documents.category);

  const p1Rows = await db
    .select({
      category: aiDocumentAssessments.category,
      total: sql<number>`count(distinct ${aiDocumentAssessments.url})::int`,
      flagged: sql<number>`count(distinct ${aiDocumentAssessments.url}) filter (where ${aiDocumentAssessments.relevant} = true)::int`,
    })
    .from(aiDocumentAssessments)
    .where(and(eq(aiDocumentAssessments.pass, 1), aiDateFilter, catAiFilter))
    .groupBy(aiDocumentAssessments.category);

  const p2Base = and(eq(aiDocumentAssessments.pass, 2), aiDateFilter, catAiFilter);
  const p2FlagRows = await db
    .select({
      category: aiDocumentAssessments.category,
      total: sql<number>`count(distinct ${aiDocumentAssessments.url})::int`,
    })
    .from(aiDocumentAssessments)
    .where(and(p2Base, eq(aiDocumentAssessments.isAuditSample, false)))
    .groupBy(aiDocumentAssessments.category);

  const p2AuditRows = await db
    .select({
      category: aiDocumentAssessments.category,
      sampled: sql<number>`count(distinct ${aiDocumentAssessments.url})::int`,
      falseNegatives: sql<number>`count(distinct ${aiDocumentAssessments.url}) filter (where ${aiDocumentAssessments.assessment} in ('potentially_concerning', 'clearly_concerning'))::int`,
    })
    .from(aiDocumentAssessments)
    .where(and(p2Base, eq(aiDocumentAssessments.isAuditSample, true)))
    .groupBy(aiDocumentAssessments.category);

  return {
    docs: new Map(docRows.map((r) => [r.category, Number(r.total)])),
    p1: new Map(p1Rows.map((r) => [r.category, r])),
    p2Flag: new Map(p2FlagRows.map((r) => [r.category, Number(r.total)])),
    p2Audit: new Map(p2AuditRows.map((r) => [r.category, r])),
  };
}

/** Sum per-category L2 counts into aggregate totals for a period. */
async function getLayer2PeriodStats(from: string, to: string, category?: string) {
  const maps = await queryL2CountsByCategory(from, to, category);
  const cats = category ? [category] : MONITORING_KEYS;

  let totalDocs = 0,
    p1Total = 0,
    p1Flagged = 0,
    p2Flagged = 0,
    auditSampled = 0,
    auditFalseNeg = 0;
  for (const cat of cats) {
    totalDocs += maps.docs.get(cat) ?? 0;
    p1Total += Number(maps.p1.get(cat)?.total ?? 0);
    p1Flagged += Number(maps.p1.get(cat)?.flagged ?? 0);
    p2Flagged += maps.p2Flag.get(cat) ?? 0;
    auditSampled += Number(maps.p2Audit.get(cat)?.sampled ?? 0);
    auditFalseNeg += Number(maps.p2Audit.get(cat)?.falseNegatives ?? 0);
  }
  return { totalDocs, p1Total, p1Flagged, p2Flagged, auditSampled, auditFalseNeg };
}

export async function getLayer2Completeness(category?: string): Promise<Layer2Completeness> {
  if (!isDbAvailable()) return [];

  const results: Layer2PeriodStats[] = [];
  for (const period of L2_PERIODS) {
    const stats = await getLayer2PeriodStats(period.from, period.to, category);
    results.push({
      period: period.id,
      label: period.label,
      totalDocuments: stats.totalDocs,
      pass1Assessed: stats.p1Total,
      missingPass1: Math.max(0, stats.totalDocs - stats.p1Total),
      pass1Flagged: stats.p1Flagged,
      pass2Flagged: stats.p2Flagged,
      missingPass2: Math.max(0, stats.p1Flagged - stats.p2Flagged),
      auditSampled: stats.auditSampled,
      auditFalseNegatives: stats.auditFalseNeg,
    });
  }
  return results;
}

export async function getClOpinionCoverage(): Promise<ClOpinionCoverage | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();

  const [stats] = await db
    .select({
      docketEntries: sql<number>`count(*) filter (where ${documents.sourceType} != 'judicial_opinion')::int`,
      opinionDocuments: sql<number>`count(*) filter (where ${documents.sourceType} = 'judicial_opinion')::int`,
      uniqueCases: sql<number>`count(distinct ${documents.caseId})::int`,
      casesWithOpinion: sql<number>`count(distinct case when ${documents.sourceType} = 'judicial_opinion' then ${documents.caseId} end)::int`,
    })
    .from(documents)
    .where(eq(documents.sourceOrigin, 'courtlistener'));

  const uniqueCases = Number(stats.uniqueCases);
  const casesWithOpinion = Number(stats.casesWithOpinion);

  return {
    docketEntries: Number(stats.docketEntries),
    opinionDocuments: Number(stats.opinionDocuments),
    uniqueCases,
    casesWithOpinion,
    casesWithoutOpinion: Math.max(0, uniqueCases - casesWithOpinion),
  };
}
