/** Source-specific coverage queries for ingest validation. */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import type { Category } from '@/lib/types';
import type {
  ContentCompleteness,
  DocumentCoverage,
  MetadataOnlyStats,
  PaginationFitness,
  SourcePeriodCoverage,
  ClOpinionCoverage,
} from './ingest-validation-service';
import { CONTENT_FIXABLE_ORIGINS } from './ingest-warnings';

export interface SignalCoverageGap {
  category: string;
  expectedSource: string;
  origin: 'signal' | 'pipeline';
}

// ---------------------------------------------------------------------------
// Document coverage and content completeness
// ---------------------------------------------------------------------------

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

export async function getContentCompleteness(category?: string): Promise<ContentCompleteness[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const conditions = [sql`${documents.contentType} != 'metadata_only'`];
  if (category) conditions.push(eq(documents.category, category));

  const rows = await db
    .select({
      sourceType: documents.sourceType,
      total: sql<number>`count(*)::int`,
      nullContent: sql<number>`count(*) filter (where ${documents.content} is null)::int`,
    })
    .from(documents)
    .where(and(...conditions))
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

export async function getContentCompletenessByOrigin(
  category?: string,
): Promise<ContentCompleteness[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const origins = [...CONTENT_FIXABLE_ORIGINS.keys()];
  if (origins.length === 0) return [];

  const catFilter = category ? eq(documents.category, category) : undefined;
  const originFilter = inArray(documents.sourceOrigin, origins);

  const rows = await db
    .select({
      sourceType: sql<string>`coalesce(${documents.sourceOrigin}, 'unknown')`,
      total: sql<number>`count(*)::int`,
      nullContent: sql<number>`count(*) filter (where ${documents.content} is null)::int`,
    })
    .from(documents)
    .where(catFilter ? and(catFilter, originFilter) : originFilter)
    .groupBy(documents.sourceOrigin);

  return rows
    .filter((r) => Number(r.nullContent) > 0)
    .map((r) => ({
      sourceType: r.sourceType,
      total: Number(r.total),
      nullContent: Number(r.nullContent),
    }));
}

// ---------------------------------------------------------------------------
// Source-specific coverage
// ---------------------------------------------------------------------------

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

export async function getCpdPeriodCoverage(category?: string): Promise<SourcePeriodCoverage[]> {
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
    where source_origin = 'govinfo_cpd'
      and ${catFilter}
    group by category, period
    order by category, period
  `);

  return (rows.rows as Array<{ category: string; period: string; count: number }>).map((r) => ({
    category: r.category,
    sourceOrigin: 'govinfo_cpd',
    period: r.period,
    count: Number(r.count),
  }));
}

export interface SignalCoverageRow {
  category: string;
  sourceOrigin: string;
  count: number;
}

/**
 * Count documents per category × source_origin.
 * Used to check whether all expected sources (from signal definitions
 * and pipeline-routed sources) actually have data.
 */
export async function getSourceCoverageByCategory(): Promise<SignalCoverageRow[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const rows = await db.execute(sql`
    select
      category,
      coalesce(source_origin, 'unknown') as source_origin,
      count(*)::int as count
    from documents
    where category <> 'intent'
    group by category, source_origin
    order by category, source_origin
  `);

  return (rows.rows as Array<{ category: string; source_origin: string; count: number }>).map(
    (r) => ({
      category: r.category,
      sourceOrigin: r.source_origin,
      count: Number(r.count),
    }),
  );
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

// ---------------------------------------------------------------------------
// Signal definition coverage
// ---------------------------------------------------------------------------

/** Map signal types from category definitions to expected source_origin values. */
const SIGNAL_TYPE_TO_ORIGIN: Record<string, string> = {
  federal_register: 'federal_register',
  courtlistener: 'courtlistener',
  doj_json: 'doj',
  govinfo: 'govinfo',
  fec_json: 'fec',
  oig_html: 'oig',
};

/** Sources that reach categories via pipeline routing, not signal definitions. */
const PIPELINE_SOURCES: Array<{ origin: string; categories: 'all' | string[] }> = [
  { origin: 'govinfo_cpd', categories: 'all' },
];

/**
 * Compare expected sources (from signal definitions + pipeline routing)
 * against actual data per category. Returns gaps where a source is expected
 * but has zero documents.
 */
export function checkSignalCoverage(
  actualCoverage: SignalCoverageRow[],
  cats: Category[],
): SignalCoverageGap[] {
  const actual = new Map<string, Set<string>>();
  for (const row of actualCoverage) {
    if (!actual.has(row.category)) actual.set(row.category, new Set());
    actual.get(row.category)!.add(row.sourceOrigin);
  }

  const gaps: SignalCoverageGap[] = [];

  for (const cat of cats) {
    const catSources = actual.get(cat.key) ?? new Set();

    // Check signal-defined sources
    const expectedFromSignals = new Set<string>();
    for (const signal of cat.signals) {
      const origin = SIGNAL_TYPE_TO_ORIGIN[signal.type];
      if (origin) expectedFromSignals.add(origin);
    }
    for (const origin of expectedFromSignals) {
      if (!catSources.has(origin)) {
        gaps.push({ category: cat.key, expectedSource: origin, origin: 'signal' });
      }
    }

    // Check pipeline-routed sources
    for (const ps of PIPELINE_SOURCES) {
      if (ps.categories === 'all' || ps.categories.includes(cat.key)) {
        if (!catSources.has(ps.origin)) {
          gaps.push({ category: cat.key, expectedSource: ps.origin, origin: 'pipeline' });
        }
      }
    }
  }

  return gaps;
}

/**
 * Whether docket-stub / rhetoric populations are correctly marked metadata_only
 * (#648: moved from Data Readiness). Uses raw execute to match the ingest style.
 */
export async function getMetadataOnlyClassification(): Promise<MetadataOnlyStats[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const populations: {
    population: string;
    column: 'source_type' | 'source_origin';
    value: string;
  }[] = [
    { population: 'CourtListener docket stubs', column: 'source_type', value: 'court_opinion' },
    { population: 'GDELT rhetoric documents', column: 'source_origin', value: 'gdelt' },
  ];

  const results: MetadataOnlyStats[] = [];
  for (const p of populations) {
    const filter =
      p.column === 'source_type'
        ? sql`${documents.sourceType} = ${p.value}`
        : sql`${documents.sourceOrigin} = ${p.value}`;
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        marked: sql<number>`count(*) filter (where ${documents.contentType} = 'metadata_only')::int`,
      })
      .from(documents)
      .where(filter);
    const total = Number(row?.total ?? 0);
    const marked = Number(row?.marked ?? 0);
    results.push({
      population: p.population,
      sourceFilter: { column: p.column, value: p.value },
      total,
      markedMetadataOnly: marked,
      unmarked: total - marked,
      pass: total === 0 || marked === total,
    });
  }
  return results;
}
