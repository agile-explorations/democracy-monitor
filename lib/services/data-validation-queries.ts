/** Layer 2, layer score, and metadata_only queries for data validation. */

import { eq, sql, and, gte, lt, inArray } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents, weeklyAggregates, aiDocumentAssessments } from '@/lib/db/schema';
import type {
  Layer2Completeness,
  Layer2PeriodStats,
  LayerScorePeriodStats,
  MetadataOnlyStats,
} from './data-validation-service';

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

async function queryL2CountsByCategory(from: string, to: string, category?: string) {
  const db = getDb();
  const { dateFilter, aiDateFilter, catFilter, catAiFilter } = buildL2Filters(from, to, category);

  const docRows = await db
    .select({
      category: documents.category,
      total: sql<number>`count(distinct ${documents.url})::int`,
    })
    .from(documents)
    .where(and(dateFilter, catFilter, sql`${documents.contentType} != 'metadata_only'`))
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

  return {
    docs: new Map(docRows.map((r) => [r.category, Number(r.total)])),
    p1: new Map(p1Rows.map((r) => [r.category, r])),
    p2FlagRoute: new Map(p2FlagRouteRows.map((r) => [r.category, r])),
    p2Audit: new Map(p2AuditRows.map((r) => [r.category, r])),
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
  return { totalDocs, p1Total, p1Flagged, p2FlagRoute, p2Concerning, auditSampled, auditFalseNeg };
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
      missingPass2: Math.max(0, stats.p1Flagged - stats.p2FlagRoute),
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
