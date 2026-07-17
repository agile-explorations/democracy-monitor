import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { documentScores, weeklyAggregates } from '@/lib/db/schema';
import { TIER_WEIGHTS } from '@/lib/methodology/scoring-config';
import { toDateString } from '@/lib/utils/date-utils';

const WEEK_DAYS = 7;

/** Given a week start date, return the start of the next week (exclusive upper bound). */
function weekEndDate(weekOf: string): string {
  const d = new Date(weekOf);
  d.setDate(d.getDate() + WEEK_DAYS);
  return toDateString(d);
}

export interface WeeklyAggregate {
  category: string;
  weekOf: string;
  totalSeverity: number;
  documentCount: number;
  avgSeverityPerDoc: number;
  captureProportion: number;
  driftProportion: number;
  warningProportion: number;
  severityMix: number;
  captureMatchCount: number;
  driftMatchCount: number;
  warningMatchCount: number;
  suppressedMatchCount: number;
  topKeywords: string[];
  structuralScore?: number;
  structuralDetail?: unknown;
  thematicScore?: number;
  thematicDetail?: unknown;
  convergenceScore?: number;
  convergenceDetail?: unknown;
  aiScore?: number;
  aiDetail?: unknown;
  computedAt: string;
}

export function computeProportions(
  captureMatchCount: number,
  driftMatchCount: number,
  warningMatchCount: number,
) {
  const totalMatches = captureMatchCount + driftMatchCount + warningMatchCount;
  const captureProportion = totalMatches > 0 ? captureMatchCount / totalMatches : 0;
  const driftProportion = totalMatches > 0 ? driftMatchCount / totalMatches : 0;
  const warningProportion = totalMatches > 0 ? warningMatchCount / totalMatches : 0;
  const severityMix =
    captureProportion * TIER_WEIGHTS.capture +
    driftProportion * TIER_WEIGHTS.drift +
    warningProportion * TIER_WEIGHTS.warning;
  return { captureProportion, driftProportion, warningProportion, severityMix };
}

/**
 * Compute a weekly aggregate from document_scores for a given category and week.
 */
export async function computeWeeklyAggregate(
  category: string,
  weekOf: string,
): Promise<WeeklyAggregate> {
  if (!isDbAvailable()) {
    return emptyAggregate(category, weekOf);
  }

  const db = getDb();
  const weekEnd = weekEndDate(weekOf);

  // Fetch aggregate stats — use range query to handle Monday vs non-Monday week starts
  const [stats] = await db
    .select({
      totalSeverity: sql<number>`coalesce(sum(${documentScores.finalScore}), 0)`,
      documentCount: sql<number>`count(*)::int`,
      captureMatchCount: sql<number>`coalesce(sum(${documentScores.captureCount}), 0)::int`,
      driftMatchCount: sql<number>`coalesce(sum(${documentScores.driftCount}), 0)::int`,
      warningMatchCount: sql<number>`coalesce(sum(${documentScores.warningCount}), 0)::int`,
      suppressedMatchCount: sql<number>`coalesce(sum(${documentScores.suppressedCount}), 0)::int`,
    })
    .from(documentScores)
    .where(
      and(
        eq(documentScores.category, category),
        gte(documentScores.weekOf, weekOf),
        lt(documentScores.weekOf, weekEnd),
      ),
    );

  const parsed = parseAggregateStats(stats);
  const proportions = computeProportions(
    parsed.captureMatchCount,
    parsed.driftMatchCount,
    parsed.warningMatchCount,
  );
  const topKeywords = await extractTopKeywords(db, category, weekOf);

  return {
    category,
    weekOf,
    ...parsed,
    ...proportions,
    topKeywords,
    computedAt: new Date().toISOString(),
  };
}

function parseAggregateStats(stats: Record<string, number>) {
  const totalSeverity = Number(stats.totalSeverity);
  const documentCount = Number(stats.documentCount);
  return {
    totalSeverity,
    documentCount,
    avgSeverityPerDoc: documentCount > 0 ? totalSeverity / documentCount : 0,
    captureMatchCount: Number(stats.captureMatchCount),
    driftMatchCount: Number(stats.driftMatchCount),
    warningMatchCount: Number(stats.warningMatchCount),
    suppressedMatchCount: Number(stats.suppressedMatchCount),
  };
}

/**
 * Extract the most frequent keywords from all documents' matches arrays for a category+week.
 */
async function extractTopKeywords(
  db: ReturnType<typeof getDb>,
  category: string,
  weekOf: string,
  limit: number = 10,
): Promise<string[]> {
  const weekEnd = weekEndDate(weekOf);
  try {
    const rows = await db.execute(sql`
      SELECT m->>'keyword' AS keyword, COUNT(*) AS cnt
      FROM ${documentScores},
           jsonb_array_elements(${documentScores.matches}) AS m
      WHERE ${documentScores.category} = ${category}
        AND ${documentScores.weekOf} >= ${weekOf}
        AND ${documentScores.weekOf} < ${weekEnd}
      GROUP BY m->>'keyword'
      ORDER BY cnt DESC
      LIMIT ${limit}
    `);
    return (rows.rows as Array<{ keyword: string }>).map((r) => r.keyword);
  } catch (err) {
    console.warn(`Failed to extract top keywords for ${category}/${weekOf}:`, err);
    return [];
  }
}

function buildAggregateValues(agg: WeeklyAggregate) {
  return {
    category: agg.category,
    weekOf: agg.weekOf,
    totalSeverity: agg.totalSeverity,
    documentCount: agg.documentCount,
    avgSeverityPerDoc: agg.avgSeverityPerDoc,
    captureProportion: agg.captureProportion,
    driftProportion: agg.driftProportion,
    warningProportion: agg.warningProportion,
    severityMix: agg.severityMix,
    captureMatchCount: agg.captureMatchCount,
    driftMatchCount: agg.driftMatchCount,
    warningMatchCount: agg.warningMatchCount,
    suppressedMatchCount: agg.suppressedMatchCount,
    topKeywords: agg.topKeywords,
    structuralScore: agg.structuralScore ?? null,
    structuralDetail: agg.structuralDetail ?? null,
    thematicScore: agg.thematicScore ?? null,
    thematicDetail: agg.thematicDetail ?? null,
    convergenceScore: agg.convergenceScore ?? null,
    convergenceDetail: agg.convergenceDetail ?? null,
    aiScore: agg.aiScore ?? null,
    aiDetail: agg.aiDetail ?? null,
    computedAt: new Date(agg.computedAt),
  };
}

/** Count/severity/keyword columns — safe for every caller to overwrite. */
const COUNT_UPSERT_SET = {
  totalSeverity: sql`excluded.total_severity`,
  documentCount: sql`excluded.document_count`,
  avgSeverityPerDoc: sql`excluded.avg_severity_per_doc`,
  captureProportion: sql`excluded.capture_proportion`,
  driftProportion: sql`excluded.drift_proportion`,
  warningProportion: sql`excluded.warning_proportion`,
  severityMix: sql`excluded.severity_mix`,
  captureMatchCount: sql`excluded.capture_match_count`,
  driftMatchCount: sql`excluded.drift_match_count`,
  warningMatchCount: sql`excluded.warning_match_count`,
  suppressedMatchCount: sql`excluded.suppressed_match_count`,
  topKeywords: sql`excluded.top_keywords`,
  computedAt: sql`excluded.computed_at`,
};

/**
 * Enrichment columns — written only by the enrichment path (#554). Bare
 * count/severity callers must NOT touch these: three separate incidents
 * (R-INGEST-GAPS, both #544 runbook bugs) came from re-stores nulling the
 * public weekly status via convergence_detail.
 */
const ENRICHMENT_UPSERT_SET = {
  structuralScore: sql`excluded.structural_score`,
  structuralDetail: sql`excluded.structural_detail`,
  thematicScore: sql`excluded.thematic_score`,
  thematicDetail: sql`excluded.thematic_detail`,
  convergenceScore: sql`excluded.convergence_score`,
  convergenceDetail: sql`excluded.convergence_detail`,
  aiScore: sql`excluded.ai_score`,
  aiDetail: sql`excluded.ai_detail`,
};

async function upsertAggregate(
  agg: WeeklyAggregate,
  set: Record<string, ReturnType<typeof sql>>,
): Promise<void> {
  if (!isDbAvailable()) return;

  const db = getDb();

  await db
    .insert(weeklyAggregates)
    .values(buildAggregateValues(agg))
    .onConflictDoUpdate({
      target: [weeklyAggregates.category, weeklyAggregates.weekOf],
      set,
    });
}

/**
 * Upsert a weekly aggregate's count/severity fields. On conflict, enrichment
 * fields (structural/thematic/convergence/ai score+detail — including the
 * public weekly status) are PRESERVED. Fresh inserts still write any
 * enrichment fields present on the input (null when absent).
 *
 * Use storeEnrichedWeeklyAggregate for the enrichment path.
 */
export async function storeWeeklyAggregate(agg: WeeklyAggregate): Promise<void> {
  await upsertAggregate(agg, COUNT_UPSERT_SET);
}

/**
 * Upsert a fully-enriched weekly aggregate: counts AND enrichment fields are
 * written, including clearing stale layer values to null when the input
 * omits them. Only enrichWithLayerScores results should flow through here.
 */
export async function storeEnrichedWeeklyAggregate(agg: WeeklyAggregate): Promise<void> {
  await upsertAggregate(agg, { ...COUNT_UPSERT_SET, ...ENRICHMENT_UPSERT_SET });
}

/**
 * Compute weekly aggregates for all category+week combinations in document_scores.
 * Optionally filter by date range and category. (Since #554,
 * storeWeeklyAggregate preserves enrichment on conflict, so scoped recomputes
 * no longer risk wiping other categories' statuses; the category filter
 * remains correct for scope and efficiency.)
 */
export async function computeAllWeeklyAggregates(
  options: { from?: string; to?: string; category?: string } = {},
): Promise<Record<string, WeeklyAggregate[]>> {
  if (!isDbAvailable()) return {};

  const db = getDb();

  // Get distinct (category, week_of) pairs
  const conditions = [sql`1=1`];
  if (options.from) conditions.push(sql`${documentScores.weekOf} >= ${options.from}`);
  if (options.to) conditions.push(sql`${documentScores.weekOf} <= ${options.to}`);
  if (options.category) conditions.push(sql`${documentScores.category} = ${options.category}`);

  const groups = await db
    .selectDistinct({
      category: documentScores.category,
      weekOf: documentScores.weekOf,
    })
    .from(documentScores)
    .where(and(...conditions))
    .orderBy(documentScores.category, documentScores.weekOf);

  const result: Record<string, WeeklyAggregate[]> = {};

  for (const { category, weekOf } of groups) {
    const agg = await computeWeeklyAggregate(category, weekOf);
    if (!result[category]) result[category] = [];
    result[category].push(agg);
  }

  return result;
}

function emptyAggregate(category: string, weekOf: string): WeeklyAggregate {
  return {
    category,
    weekOf,
    totalSeverity: 0,
    documentCount: 0,
    avgSeverityPerDoc: 0,
    captureProportion: 0,
    driftProportion: 0,
    warningProportion: 0,
    severityMix: 0,
    captureMatchCount: 0,
    driftMatchCount: 0,
    warningMatchCount: 0,
    suppressedMatchCount: 0,
    topKeywords: [],
    computedAt: new Date().toISOString(),
  };
}

/** Get the most recent weekOf date in weekly_aggregates. */
export async function getLatestAggregatedWeek(): Promise<string | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();
  const [row] = await db
    .select({ latest: sql<string>`max(${weeklyAggregates.weekOf})::text` })
    .from(weeklyAggregates);
  return row?.latest ?? null;
}

/** Find analysis-period weeks that have aggregates but are missing overview narratives. */
export async function getWeeksMissingNarratives(beforeWeek: string): Promise<string[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  // Only check analysis period (2025-01-20+) — baseline periods don't need narratives
  const result = await db.execute(sql`
    SELECT DISTINCT wa.week_of::text as week_of
    FROM weekly_aggregates wa
    WHERE wa.week_of >= '2025-01-20'
      AND wa.week_of < ${beforeWeek}
      AND NOT EXISTS (
        SELECT 1 FROM narratives n
        WHERE n.week_of = wa.week_of AND n.category = '_overview'
      )
    ORDER BY 1
  `);
  return (result.rows as { week_of: string }[]).map((r) => r.week_of);
}

/**
 * Get the Monday of the week for a given date string.
 */
export function getWeekOfDate(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return toDateString(d);
}

/**
 * Get the Monday of the last completed week (where Sunday has passed).
 * On Sunday, returns the current week's Monday (week is done).
 * On Monday–Saturday, returns the previous week's Monday.
 */
export function getLastCompletedWeek(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  // On Sunday (0), week ending today is complete — go back 6 days to its Monday.
  // On Mon–Sat (1–6), previous week is complete — go back to its Monday.
  const daysBack = day === 0 ? 6 : day - 1 + 7;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return toDateString(d);
}
