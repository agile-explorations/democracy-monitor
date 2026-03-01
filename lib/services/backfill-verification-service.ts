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

export interface SourcePeriodCoverage {
  category: string;
  sourceOrigin: string;
  period: string;
  count: number;
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
  const catDocFilter = category
    ? eq(documents.category, category)
    : inArray(documents.category, MONITORING_KEYS);
  const dateFilter = and(
    gte(documents.publishedAt, new Date(from)),
    lt(documents.publishedAt, new Date(to)),
  );
  const catAiFilter = category
    ? eq(aiDocumentAssessments.category, category)
    : inArray(aiDocumentAssessments.category, MONITORING_KEYS);
  const aiDateFilter = and(
    sql`${aiDocumentAssessments.weekOf} >= ${from}`,
    sql`${aiDocumentAssessments.weekOf} < ${to}`,
  );
  return { catDocFilter, dateFilter, catAiFilter, aiDateFilter };
}

async function getLayer2PeriodStats(from: string, to: string, category?: string) {
  const db = getDb();
  const { catDocFilter, dateFilter, catAiFilter, aiDateFilter } = buildL2Filters(
    from,
    to,
    category,
  );

  const [docCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(dateFilter, catDocFilter));

  const [p1] = await db
    .select({
      total: sql<number>`count(distinct ${aiDocumentAssessments.url})::int`,
      flagged: sql<number>`count(distinct ${aiDocumentAssessments.url}) filter (where ${aiDocumentAssessments.relevant} = true)::int`,
    })
    .from(aiDocumentAssessments)
    .where(and(eq(aiDocumentAssessments.pass, 1), aiDateFilter, catAiFilter));

  const p2Base = and(eq(aiDocumentAssessments.pass, 2), aiDateFilter, catAiFilter);

  const [p2Flagged] = await db
    .select({ total: sql<number>`count(distinct ${aiDocumentAssessments.url})::int` })
    .from(aiDocumentAssessments)
    .where(and(p2Base, eq(aiDocumentAssessments.isAuditSample, false)));

  const [p2Audit] = await db
    .select({
      sampled: sql<number>`count(distinct ${aiDocumentAssessments.url})::int`,
      falseNegatives: sql<number>`count(distinct ${aiDocumentAssessments.url}) filter (where ${aiDocumentAssessments.assessment} in ('potentially_concerning', 'clearly_concerning'))::int`,
    })
    .from(aiDocumentAssessments)
    .where(and(p2Base, eq(aiDocumentAssessments.isAuditSample, true)));

  return {
    totalDocs: Number(docCount.total),
    p1Total: Number(p1.total),
    p1Flagged: Number(p1.flagged),
    p2Flagged: Number(p2Flagged.total),
    auditSampled: Number(p2Audit.sampled),
    auditFalseNeg: Number(p2Audit.falseNegatives),
  };
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

export async function getPaginationFitness(category?: string): Promise<PaginationFitness[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const catFilter = category ? sql`d.category = ${category}` : sql`1=1`;

  const rows = await db.execute(sql`
    select
      d.category,
      coalesce(d.source_origin, 'unknown') as source_origin,
      max(weekly_count)::int as peak_weekly_count
    from (
      select
        category,
        source_origin,
        date_trunc('week', published_at) as week,
        count(*) as weekly_count
      from documents d
      where source_origin = 'courtlistener'
        and ${catFilter}
      group by category, source_origin, date_trunc('week', published_at)
    ) d
    group by d.category, d.source_origin
    order by d.category
  `);

  return (
    rows.rows as Array<{ category: string; source_origin: string; peak_weekly_count: number }>
  ).map((r) => ({
    category: r.category,
    sourceOrigin: r.source_origin,
    peakWeeklyCount: Number(r.peak_weekly_count),
  }));
}

export async function getFrPeriodCoverage(category?: string): Promise<SourcePeriodCoverage[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const catFilter = category ? sql`category = ${category}` : sql`1=1`;

  const rows = await db.execute(sql`
    select
      category,
      case
        when published_at >= '2022-01-20' and published_at < '2023-01-20' then 'biden_2022'
        when published_at >= '2021-01-20' and published_at < '2022-01-20' then 'biden_2021'
        when published_at >= '2017-01-20' and published_at < '2018-01-20' then 'trump_2017'
        when published_at >= '2018-01-20' and published_at < '2019-01-20' then 'trump_2018'
        when published_at >= '2025-01-20' then 'trump_t2'
        else 'other'
      end as period,
      count(*)::int as count
    from documents
    where source_origin = 'federal_register'
      and ${catFilter}
    group by category, period
    order by category, period
  `);

  return (rows.rows as Array<{ category: string; period: string; count: number }>).map((r) => ({
    category: r.category,
    sourceOrigin: 'federal_register',
    period: r.period,
    count: Number(r.count),
  }));
}

export async function getGdeltCrossfeedCoverage(
  category?: string,
): Promise<SourcePeriodCoverage[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const catFilter = category ? sql`category = ${category}` : sql`1=1`;

  const rows = await db.execute(sql`
    select
      category,
      count(*)::int as count
    from documents
    where source_origin = 'gdelt'
      and category != 'intent'
      and ${catFilter}
    group by category
    order by category
  `);

  return (rows.rows as Array<{ category: string; count: number }>).map((r) => ({
    category: r.category,
    sourceOrigin: 'gdelt',
    period: 'all',
    count: Number(r.count),
  }));
}
