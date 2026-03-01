/** Pure query functions for backfill completeness verification. */

import { eq, sql, isNull, and } from 'drizzle-orm';
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

export interface Layer2Completeness {
  totalT2Documents: number;
  missingPass1: number;
  missingPass2: number;
}

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

  const conditions = category ? [eq(documents.category, category)] : [];
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      category: documents.category,
      sourceOrigin: sql<string>`coalesce(${documents.sourceOrigin}, 'unknown')`,
      count: sql<number>`count(*)::int`,
    })
    .from(documents)
    .where(whereClause)
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

  // Documents missing scores: documents with no matching document_scores row
  const [scoreStats] = await db
    .select({
      missingScores: sql<number>`count(*)::int`,
    })
    .from(documents)
    .leftJoin(documentScores, eq(documents.url, documentScores.url))
    .where(catFilter ? and(catFilter, isNull(documentScores.id)) : isNull(documentScores.id));

  // Weeks with scores but no aggregates
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
  const db = getDb();

  const rows = await db
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

export async function getLayer2Completeness(category?: string): Promise<Layer2Completeness> {
  if (!isDbAvailable()) {
    return { totalT2Documents: 0, missingPass1: 0, missingPass2: 0 };
  }
  const db = getDb();

  // T2 documents (from 2025-01-20 onward)
  const t2Filter = sql`${documents.publishedAt} >= '2025-01-20'`;
  const catFilter = category ? eq(documents.category, category) : undefined;
  const where = catFilter ? and(t2Filter, catFilter) : t2Filter;

  const [docCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(documents)
    .where(where);

  // Pass 1 coverage
  const p1Filter = eq(aiDocumentAssessments.pass, 1);
  const [pass1] = await db
    .select({ count: sql<number>`count(distinct ${aiDocumentAssessments.url})::int` })
    .from(aiDocumentAssessments)
    .where(category ? and(p1Filter, eq(aiDocumentAssessments.category, category)) : p1Filter);

  // Pass 2 coverage
  const p2Filter = eq(aiDocumentAssessments.pass, 2);
  const [pass2] = await db
    .select({ count: sql<number>`count(distinct ${aiDocumentAssessments.url})::int` })
    .from(aiDocumentAssessments)
    .where(category ? and(p2Filter, eq(aiDocumentAssessments.category, category)) : p2Filter);

  const total = Number(docCount.total);
  return {
    totalT2Documents: total,
    missingPass1: Math.max(0, total - Number(pass1.count)),
    missingPass2: Math.max(0, total - Number(pass2.count)),
  };
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

/** FR document counts per category per baseline period. */
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

/** GDELT cross-feed document counts per category (excluding 'intent'). */
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
