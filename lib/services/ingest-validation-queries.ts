/** Source-specific coverage queries for ingest validation. */

import { eq, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import type {
  PaginationFitness,
  SourcePeriodCoverage,
  ClOpinionCoverage,
} from './ingest-validation-service';

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

export interface SourcePeriodGap {
  sourceOrigin: string;
  period: string;
  count: number;
  earliestDate: string | null;
}

/**
 * Count documents per source_origin per analysis period.
 * Used to detect sources missing from specific periods.
 */
export async function getSourcePeriodCoverage(): Promise<SourcePeriodGap[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const rows = await db.execute(sql`
    select
      coalesce(source_origin, 'unknown') as source_origin,
      case
        when published_at >= '2017-01-20' and published_at < '2018-01-20' then 'trump_2017'
        when published_at >= '2018-01-20' and published_at < '2019-01-20' then 'trump_2018'
        when published_at >= '2021-01-20' and published_at < '2022-01-20' then 'biden_2021'
        when published_at >= '2022-01-20' and published_at < '2023-01-20' then 'biden_2022'
        when published_at >= '2025-01-20' then 'trump_t2'
        else 'other'
      end as period,
      count(*)::int as count,
      min(published_at)::date as earliest_date
    from documents
    where category != 'intent'
    group by source_origin, period
    order by source_origin, period
  `);

  return (
    rows.rows as Array<{
      source_origin: string;
      period: string;
      count: number;
      earliest_date: string | null;
    }>
  ).map((r) => ({
    sourceOrigin: r.source_origin,
    period: r.period,
    count: Number(r.count),
    earliestDate: r.earliest_date ? String(r.earliest_date).slice(0, 10) : null,
  }));
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
