import { and, eq, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { documentScores, weeklyAggregates } from '@/lib/db/schema';
import { TIER_WEIGHTS } from '@/lib/methodology/scoring-config';
import { toDateString } from '@/lib/utils/date-utils';

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

  // Fetch aggregate stats in a single query
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
    .where(and(eq(documentScores.category, category), eq(documentScores.weekOf, weekOf)));

  const totalSeverity = Number(stats.totalSeverity);
  const documentCount = Number(stats.documentCount);
  const avgSeverityPerDoc = documentCount > 0 ? totalSeverity / documentCount : 0;

  const captureMatchCount = Number(stats.captureMatchCount);
  const driftMatchCount = Number(stats.driftMatchCount);
  const warningMatchCount = Number(stats.warningMatchCount);
  const suppressedMatchCount = Number(stats.suppressedMatchCount);

  const proportions = computeProportions(captureMatchCount, driftMatchCount, warningMatchCount);
  const topKeywords = await extractTopKeywords(db, category, weekOf);

  return {
    category,
    weekOf,
    totalSeverity,
    documentCount,
    avgSeverityPerDoc,
    ...proportions,
    captureMatchCount,
    driftMatchCount,
    warningMatchCount,
    suppressedMatchCount,
    topKeywords,
    computedAt: new Date().toISOString(),
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
  try {
    const rows = await db.execute(sql`
      SELECT m->>'keyword' AS keyword, COUNT(*) AS cnt
      FROM ${documentScores},
           jsonb_array_elements(${documentScores.matches}) AS m
      WHERE ${documentScores.category} = ${category}
        AND ${documentScores.weekOf} = ${weekOf}
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

/**
 * Upsert a weekly aggregate into the database.
 */
export async function storeWeeklyAggregate(agg: WeeklyAggregate): Promise<void> {
  if (!isDbAvailable()) return;

  const db = getDb();

  await db
    .insert(weeklyAggregates)
    .values({
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
      computedAt: new Date(agg.computedAt),
    })
    .onConflictDoUpdate({
      target: [weeklyAggregates.category, weeklyAggregates.weekOf],
      set: {
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
      },
    });
}

/**
 * Compute weekly aggregates for all category+week combinations in document_scores.
 * Optionally filter by date range.
 */
export async function computeAllWeeklyAggregates(
  options: { from?: string; to?: string } = {},
): Promise<Record<string, WeeklyAggregate[]>> {
  if (!isDbAvailable()) return {};

  const db = getDb();

  // Get distinct (category, week_of) pairs
  const conditions = [sql`1=1`];
  if (options.from) conditions.push(sql`${documentScores.weekOf} >= ${options.from}`);
  if (options.to) conditions.push(sql`${documentScores.weekOf} <= ${options.to}`);

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
