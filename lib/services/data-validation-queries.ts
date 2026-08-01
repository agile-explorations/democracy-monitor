/** Layer 2, layer score, and metadata_only queries for data validation. */

import { eq, sql, and, gte, lt, inArray } from 'drizzle-orm';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import { retrievalRelevantOnly } from '@/lib/db/document-filters';
import { documents, weeklyAggregates, aiDocumentAssessments } from '@/lib/db/schema';
import type {
  Layer2Completeness,
  Layer2PeriodStats,
  LayerScorePeriodStats,
  MetadataOnlyStats,
  NarrativeCoverage,
} from './data-validation-service';
import { getTermSummaryFreshness } from './term-summary-queries';

// ---------------------------------------------------------------------------
// Shared period definitions
// ---------------------------------------------------------------------------

const VALIDATION_PERIODS = [
  ...BASELINE_CONFIGS.map((c) => ({ id: c.id, label: c.label, from: c.from, to: c.to })),
  { id: 'trump_t2', label: 'Trump T2 (2025–)', from: '2025-01-20', to: '2030-01-01' },
];

// ---------------------------------------------------------------------------
// Layer 2 completeness
// ---------------------------------------------------------------------------

const MONITORING_KEYS = CATEGORIES.map((c) => c.key);

function buildL2Filters(from: string, to: string, category?: string) {
  return {
    dateFilter: and(
      gte(documents.publishedAt, new Date(from)),
      lt(documents.publishedAt, new Date(to)),
    ),
    catFilter: category
      ? eq(documents.category, category)
      : inArray(documents.category, MONITORING_KEYS),
    catAiFilter: category
      ? eq(aiDocumentAssessments.category, category)
      : inArray(aiDocumentAssessments.category, MONITORING_KEYS),
  };
}

/**
 * Build an EXISTS subquery that matches ai_document_assessments rows to
 * documents published within a date range. This avoids week_of alignment
 * issues where boundary weeks straddle period starts.
 */
function buildDocExistsFilter(from: string, to: string, category?: string) {
  const catSql = category ? sql`and d2.category = ${category}` : sql``;
  return sql`exists (select 1 from documents d2 where d2.url = ${aiDocumentAssessments.url} and d2.category = ${aiDocumentAssessments.category} and d2.published_at >= ${from}::date and d2.published_at < ${to}::date ${catSql})`;
}

async function queryL2DocAndP1(from: string, to: string, category?: string) {
  const db = getDb();
  const { dateFilter, catFilter, catAiFilter } = buildL2Filters(from, to, category);

  // Review-eligible docs: non-metadata_only, content >= 100 chars (matches
  // backfill-document-review.ts filter). counting_scope is deliberately NOT
  // applied: this is the L2 evidence population, which #587 leaves intact.
  const l2Eligible = and(
    dateFilter,
    catFilter,
    sql`${documents.contentType} != 'metadata_only'`,
    sql`${documents.content} is not null`,
    sql`length(${documents.content}) >= 100`,
    retrievalRelevantOnly(),
  );

  const docRows = await db
    .select({
      category: documents.category,
      total: sql<number>`count(distinct ${documents.url})::int`,
    })
    .from(documents)
    .where(l2Eligible)
    .groupBy(documents.category);

  const p1Rows = await db
    .select({
      category: aiDocumentAssessments.category,
      total: sql<number>`count(distinct ${aiDocumentAssessments.url})::int`,
      flagged: sql<number>`count(distinct ${aiDocumentAssessments.url}) filter (where ${aiDocumentAssessments.relevant} = true)::int`,
    })
    .from(aiDocumentAssessments)
    .where(
      and(eq(aiDocumentAssessments.pass, 1), catAiFilter, buildDocExistsFilter(from, to, category)),
    )
    .groupBy(aiDocumentAssessments.category);

  return { docRows, p1Rows };
}

async function queryL2P2(from: string, to: string, category?: string) {
  const db = getDb();
  const { catAiFilter } = buildL2Filters(from, to, category);
  const p2Base = and(
    eq(aiDocumentAssessments.pass, 2),
    catAiFilter,
    buildDocExistsFilter(from, to, category),
  );

  const p2FlagRouteRows = await db
    .select({
      category: aiDocumentAssessments.category,
      total: sql<number>`count(distinct ${aiDocumentAssessments.url})::int`,
      concerning: sql<number>`count(distinct ${aiDocumentAssessments.url}) filter (where ${aiDocumentAssessments.assessment} in ('potentially_concerning', 'clearly_concerning'))::int`,
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

  return { p2FlagRouteRows, p2AuditRows };
}

async function queryL2P2Gaps(from: string, to: string, category?: string): Promise<number> {
  const db = getDb();
  const { catAiFilter } = buildL2Filters(from, to, category);
  // Only count gaps for docs with sufficient content (>= 100 chars) — short docs
  // permanently fail P2 parse and are skipped by retryMissingPass2.
  const contentFilter = sql`EXISTS (
    SELECT 1 FROM ${documents} d3
    WHERE d3.url = ${aiDocumentAssessments.url}
      AND d3.category = ${aiDocumentAssessments.category}
      AND d3.content IS NOT NULL AND length(d3.content) >= 100
  )`;
  const [row] = await db
    .select({
      missing: sql<number>`count(distinct (${aiDocumentAssessments.url}, ${aiDocumentAssessments.category}))::int`,
    })
    .from(aiDocumentAssessments)
    .where(
      and(
        eq(aiDocumentAssessments.pass, 1),
        eq(aiDocumentAssessments.relevant, true),
        catAiFilter,
        buildDocExistsFilter(from, to, category),
        contentFilter,
        sql`NOT EXISTS (
          SELECT 1 FROM ${aiDocumentAssessments} a2
          WHERE a2.url = ${aiDocumentAssessments.url}
            AND a2.category = ${aiDocumentAssessments.category}
            AND a2.pass = 2 AND a2.is_audit_sample = false
        )`,
      ),
    );
  return Number(row.missing);
}

async function queryL2CountsByCategory(from: string, to: string, category?: string) {
  const [{ docRows, p1Rows }, { p2FlagRouteRows, p2AuditRows }, p2GapCount] = await Promise.all([
    queryL2DocAndP1(from, to, category),
    queryL2P2(from, to, category),
    queryL2P2Gaps(from, to, category),
  ]);

  return {
    docs: new Map(docRows.map((r) => [r.category, Number(r.total)])),
    p1: new Map(p1Rows.map((r) => [r.category, r])),
    p2FlagRoute: new Map(p2FlagRouteRows.map((r) => [r.category, r])),
    p2Audit: new Map(p2AuditRows.map((r) => [r.category, r])),
    p2GapCount,
  };
}

async function getLayer2PeriodStats(from: string, to: string, category?: string) {
  const maps = await queryL2CountsByCategory(from, to, category);
  const cats = category ? [category] : MONITORING_KEYS;

  let totalDocs = 0,
    p1Total = 0,
    p1Flagged = 0,
    p2FlagRoute = 0,
    p2Concerning = 0,
    auditSampled = 0,
    auditFalseNeg = 0;
  for (const cat of cats) {
    totalDocs += maps.docs.get(cat) ?? 0;
    p1Total += Number(maps.p1.get(cat)?.total ?? 0);
    p1Flagged += Number(maps.p1.get(cat)?.flagged ?? 0);
    const p2fr = maps.p2FlagRoute.get(cat);
    p2FlagRoute += Number(p2fr?.total ?? 0);
    p2Concerning += Number(p2fr?.concerning ?? 0);
    auditSampled += Number(maps.p2Audit.get(cat)?.sampled ?? 0);
    auditFalseNeg += Number(maps.p2Audit.get(cat)?.falseNegatives ?? 0);
  }
  return {
    totalDocs,
    p1Total,
    p1Flagged,
    p2FlagRoute,
    p2Concerning,
    p2Missing: maps.p2GapCount,
    auditSampled,
    auditFalseNeg,
  };
}

export async function getLayer2Completeness(category?: string): Promise<Layer2Completeness> {
  if (!isDbAvailable()) return [];

  const results: Layer2PeriodStats[] = [];
  for (const period of VALIDATION_PERIODS) {
    const stats = await getLayer2PeriodStats(period.from, period.to, category);
    results.push({
      period: period.id,
      label: period.label,
      totalDocuments: stats.totalDocs,
      pass1Assessed: stats.p1Total,
      missingPass1: Math.max(0, stats.totalDocs - stats.p1Total),
      pass1Flagged: stats.p1Flagged,
      pass2Assessed: stats.p2FlagRoute + stats.auditSampled,
      missingPass2: stats.p2Missing,
      pass2Flagged: stats.p2Concerning + stats.auditFalseNeg,
      auditSampled: stats.auditSampled,
      auditFalseNegatives: stats.auditFalseNeg,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Layer score population check
// ---------------------------------------------------------------------------

export async function getLayerScorePopulation(category?: string): Promise<LayerScorePeriodStats[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const results: LayerScorePeriodStats[] = [];
  for (const period of VALIDATION_PERIODS) {
    const conditions = [
      sql`${weeklyAggregates.weekOf} >= ${period.from}`,
      sql`${weeklyAggregates.weekOf} < ${period.to}`,
    ];
    if (category) conditions.push(eq(weeklyAggregates.category, category));

    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        withStructural: sql<number>`count(*) filter (where ${weeklyAggregates.structuralScore} is not null)::int`,
        withAi: sql<number>`count(*) filter (where ${weeklyAggregates.aiScore} is not null)::int`,
        withThematic: sql<number>`count(*) filter (where ${weeklyAggregates.thematicScore} is not null)::int`,
        withConvergence: sql<number>`count(*) filter (where ${weeklyAggregates.convergenceScore} is not null)::int`,
        withAll: sql<number>`count(*) filter (where ${weeklyAggregates.structuralScore} is not null and ${weeklyAggregates.aiScore} is not null and ${weeklyAggregates.thematicScore} is not null)::int`,
      })
      .from(weeklyAggregates)
      .where(and(...conditions));

    results.push({
      period: period.id,
      label: period.label,
      totalWeeks: Number(stats.total),
      withStructural: Number(stats.withStructural),
      withAi: Number(stats.withAi),
      withThematic: Number(stats.withThematic),
      withConvergence: Number(stats.withConvergence),
      withAllLayers: Number(stats.withAll),
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// metadata_only classification check
// ---------------------------------------------------------------------------

export async function getMetadataOnlyClassification(): Promise<MetadataOnlyStats[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const results: MetadataOnlyStats[] = [];

  const [clStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      marked: sql<number>`count(*) filter (where ${documents.contentType} = 'metadata_only')::int`,
    })
    .from(documents)
    .where(eq(documents.sourceType, 'court_opinion'));

  const clTotal = Number(clStats.total);
  const clMarked = Number(clStats.marked);
  results.push({
    population: 'CourtListener docket stubs',
    sourceFilter: { column: 'source_type', value: 'court_opinion' },
    total: clTotal,
    markedMetadataOnly: clMarked,
    unmarked: clTotal - clMarked,
    pass: clTotal === 0 || clMarked === clTotal,
  });

  const [gdeltStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      marked: sql<number>`count(*) filter (where ${documents.contentType} = 'metadata_only')::int`,
    })
    .from(documents)
    .where(eq(documents.sourceOrigin, 'gdelt'));

  const gdeltTotal = Number(gdeltStats.total);
  const gdeltMarked = Number(gdeltStats.marked);
  results.push({
    population: 'GDELT rhetoric documents',
    sourceFilter: { column: 'source_origin', value: 'gdelt' },
    total: gdeltTotal,
    markedMetadataOnly: gdeltMarked,
    unmarked: gdeltTotal - gdeltMarked,
    pass: gdeltTotal === 0 || gdeltMarked === gdeltTotal,
  });

  return results;
}

// ---------------------------------------------------------------------------
// Narrative coverage
// ---------------------------------------------------------------------------

const EMPTY_NARRATIVE_COVERAGE: NarrativeCoverage = {
  elevatedWeeks: 0,
  narrativeWeeks: 0,
  missingWeeks: 0,
  weeksWithNarratives: 0,
  weeksWithSummary: 0,
  termSummaryFresh: false,
  missingSummaryWeeks: 0,
};

function toNarrativeCoverage(
  row: Record<string, unknown>,
  termSummaryFresh: boolean,
): NarrativeCoverage {
  return {
    elevatedWeeks: Number(row.elevated_weeks ?? 0),
    narrativeWeeks: Number(row.narrative_weeks ?? 0),
    missingWeeks: Number(row.missing_weeks ?? 0),
    weeksWithNarratives: Number(row.weeks_with_narratives ?? 0),
    weeksWithSummary: Number(row.weeks_with_summary ?? 0),
    termSummaryFresh,
    missingSummaryWeeks: Number(row.missing_summary_weeks ?? 0),
  };
}

export async function getNarrativeCoverage(category?: string): Promise<NarrativeCoverage> {
  if (!isDbAvailable()) return EMPTY_NARRATIVE_COVERAGE;
  const db = getDb();

  const catFilter = category ? sql`AND wa.category = ${category}` : sql``;

  const rows = await db.execute(sql`
    WITH elevated AS (
      SELECT category, week_of, computed_at
      FROM weekly_aggregates wa
      WHERE convergence_detail IS NOT NULL
        AND convergence_detail->>'status' <> 'Stable'
        ${catFilter}
    ),
    narr AS (
      SELECT category, week_of, max(generated_at) as latest_generated
      FROM narratives
      WHERE category NOT IN ('_overview', '_term_summary')
      GROUP BY category, week_of
    ),
    summary_weeks AS (
      SELECT DISTINCT week_of FROM narratives WHERE category = '_overview'
    ),
    narrated_weeks AS (
      SELECT DISTINCT e.week_of
      FROM elevated e
      JOIN narr n ON n.category = e.category AND n.week_of = e.week_of
    )
    SELECT
      count(DISTINCT (e.category, e.week_of))::int AS elevated_weeks,
      count(DISTINCT CASE WHEN n.week_of IS NOT NULL
            THEN (e.category, e.week_of) END)::int AS narrative_weeks,
      count(DISTINCT CASE WHEN n.week_of IS NULL
            THEN (e.category, e.week_of) END)::int AS missing_weeks,
      (SELECT count(*)::int FROM narrated_weeks) AS weeks_with_narratives,
      (SELECT count(*)::int FROM summary_weeks) AS weeks_with_summary,
      (SELECT count(*)::int FROM narrated_weeks nw
       WHERE NOT EXISTS (SELECT 1 FROM summary_weeks sw WHERE sw.week_of = nw.week_of)
      ) AS missing_summary_weeks
    FROM elevated e
    LEFT JOIN narr n ON n.category = e.category AND n.week_of = e.week_of
  `);

  const freshness = await getTermSummaryFreshness(T2_INAUGURATION);
  const termSummaryFresh = freshness.generatedAt !== null && !freshness.stale;
  return toNarrativeCoverage(rows.rows[0] as Record<string, unknown>, termSummaryFresh);
}
