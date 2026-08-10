import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import type {
  NarrativeBaselineContext,
  NarrativeDocumentContext,
  NarrativeFlaggedDocContext,
  NarrativeLayerData,
  NarrativeSourceHealth,
  NarrativeThematicDocRef,
  NarrativeTrajectory,
  SourceTypeBreakdown,
  TermStatistics,
} from '@/lib/types';
import { OVERVIEW_CATEGORY, TERM_SUMMARY_CATEGORY } from '@/lib/types';
import { stripBoilerplate } from '@/lib/utils/content-cleaners';
import { addDays } from '@/lib/utils/date-utils';
import { getStoredNarrative } from './narrative-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIDEN_2022_START = '2022-01-20';
const BIDEN_2022_END = '2023-01-20';
const TREND_THRESHOLD = 0.05;

type Row = Record<string, unknown>;

/** Offset a YYYY-MM-DD date string by a number of days. */

/** Format a timestamp value as YYYY-MM-DD, or null. */
function toDateStr(value: unknown): string | null {
  return value ? new Date(value as string).toISOString().slice(0, 10) : null;
}

// ---------------------------------------------------------------------------
// 1. Top concerning documents (enhanced)
// ---------------------------------------------------------------------------

/**
 * Get the top concerning documents from Pass 2 AI assessment for a category-week.
 * Enhanced version: includes url, publishedAt, and truncated content.
 */
export async function getTopConcerningDocuments(
  category: string,
  weekOf: string,
  limit = 8,
): Promise<NarrativeDocumentContext[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT d.title, d.source_type, d.source_origin,
      d.metadata->>'agency' AS agency, d.published_at, d.url,
      a2.assessment, a2.erosion_type, a2.erosion_actor, a2.reasoning,
      LEFT(d.content, 4000) AS content
    FROM ai_document_assessments a2
    JOIN documents d ON d.url = a2.url AND d.category = a2.category
    WHERE a2.category = ${category} AND a2.week_of = ${weekOf}
      AND a2.pass = 2 AND a2.is_audit_sample = false
      AND a2.assessment IN ('potentially_concerning', 'clearly_concerning')
    ORDER BY
      CASE a2.assessment WHEN 'clearly_concerning' THEN 0
        WHEN 'potentially_concerning' THEN 1 END,
      a2.confidence DESC NULLS LAST
    LIMIT ${limit}
  `);
  return (rows.rows as Row[]).map((r) => {
    const title = (r.title as string) ?? 'Untitled';
    const rawContent = r.content as string | null;
    const sourceOrigin = r.source_origin as string | null;
    return {
      title,
      sourceType: (r.source_type as string) ?? 'unknown',
      sourceOrigin,
      agency: r.agency as string | null,
      publishedAt: toDateStr(r.published_at),
      url: (r.url as string) ?? '',
      assessment: (r.assessment as string) ?? 'unknown',
      erosionType: r.erosion_type as string | null,
      erosionActor: r.erosion_actor as string | null,
      reasoning: r.reasoning as string | null,
      content: rawContent ? stripBoilerplate(rawContent, sourceOrigin, title) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Flagged routine documents
// ---------------------------------------------------------------------------

/**
 * Get documents flagged by P1 (relevant=true) but classified as routine or
 * novel_not_concerning by P2.
 */
export async function getFlaggedRoutineDocs(
  category: string,
  weekOf: string,
  limit = 5,
): Promise<NarrativeFlaggedDocContext[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT d.title, d.source_type, d.published_at
    FROM ai_document_assessments a1
    JOIN ai_document_assessments a2
      ON a2.url = a1.url AND a2.category = a1.category
      AND a2.pass = 2 AND a2.is_audit_sample = false
    JOIN documents d ON d.url = a1.url AND d.category = a1.category
    WHERE a1.category = ${category} AND a1.week_of = ${weekOf}
      AND a1.pass = 1 AND a1.relevant = true
      AND a2.assessment IN ('routine', 'novel_not_concerning')
    ORDER BY d.published_at DESC NULLS LAST
    LIMIT ${limit}
  `);
  return (rows.rows as Row[]).map((r) => ({
    title: (r.title as string) ?? 'Untitled',
    sourceType: (r.source_type as string) ?? 'unknown',
    publishedAt: toDateStr(r.published_at),
  }));
}

// ---------------------------------------------------------------------------
// 3. Source type breakdown
// ---------------------------------------------------------------------------

/** Count documents by source_type for a category in a given week (7-day window). */
export async function getSourceTypeBreakdown(
  category: string,
  weekOf: string,
): Promise<SourceTypeBreakdown[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const weekEnd = addDays(weekOf, 7);
  const rows = await db.execute(sql`
    SELECT source_type, COUNT(*)::int AS count
    FROM documents
    WHERE category = ${category}
      AND published_at >= ${weekOf}::date AND published_at < ${weekEnd}::date
      AND retrieval_relevant IS NOT FALSE
    GROUP BY source_type ORDER BY count DESC
  `);
  return (rows.rows as Row[]).map((r) => ({
    sourceType: (r.source_type as string) ?? 'unknown',
    count: (r.count as number) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// 4. Baseline context
// ---------------------------------------------------------------------------

/**
 * Get baseline context from the biden_2022 period in weekly_aggregates:
 * average doc count, average P2 concern rate, structural score range.
 */
export async function getBaselineContext(category: string): Promise<NarrativeBaselineContext> {
  const empty: NarrativeBaselineContext = {
    avgDocsPerWeek: 0,
    avgP2ConcernRate: 0,
    structuralScoreRange: 'N/A',
  };
  if (!isDbAvailable()) return empty;
  const db = getDb();
  const result = await db.execute(sql`
    SELECT AVG(document_count)::float AS avg_docs,
      AVG((ai_detail->>'concernRate')::float) AS avg_concern_rate,
      MIN(structural_score)::float AS min_structural,
      MAX(structural_score)::float AS max_structural
    FROM weekly_aggregates
    WHERE category = ${category}
      AND week_of >= ${BIDEN_2022_START} AND week_of < ${BIDEN_2022_END}
  `);
  const row = (result.rows as Row[])[0];
  if (!row) return empty;
  const minS = row.min_structural as number | null;
  const maxS = row.max_structural as number | null;
  return {
    avgDocsPerWeek: (row.avg_docs as number) ?? 0,
    avgP2ConcernRate: (row.avg_concern_rate as number) ?? 0,
    structuralScoreRange:
      minS != null && maxS != null ? `${minS.toFixed(2)}-${maxS.toFixed(2)}` : 'N/A',
  };
}

// ---------------------------------------------------------------------------
// 5. Trajectory
// ---------------------------------------------------------------------------

/**
 * Get trajectory context: previous week's convergence status and how many
 * consecutive weeks the current status has persisted.
 */
export async function getTrajectory(
  category: string,
  weekOf: string,
): Promise<NarrativeTrajectory> {
  if (!isDbAvailable())
    return { previousWeekStatus: null, previousWeekDocCount: null, consecutiveWeeksAtStatus: 0 };
  const db = getDb();
  const currentRows = await db.execute(sql`
    SELECT convergence_detail->>'status' AS status
    FROM weekly_aggregates WHERE category = ${category} AND week_of = ${weekOf} LIMIT 1
  `);
  const currentStatus = (currentRows.rows as Row[])[0]?.status as string | null;
  const historyRows = await db.execute(sql`
    SELECT convergence_detail->>'status' AS status, document_count
    FROM weekly_aggregates
    WHERE category = ${category} AND week_of < ${weekOf}
    ORDER BY week_of DESC LIMIT 52
  `);
  const history = historyRows.rows as Row[];
  let consecutiveWeeks = 0;
  if (currentStatus) {
    for (const row of history) {
      if (row.status === currentStatus) consecutiveWeeks++;
      else break;
    }
  }
  const prev = history[0];
  return {
    previousWeekStatus: prev ? (prev.status as string | null) : null,
    previousWeekDocCount: prev?.document_count != null ? Number(prev.document_count) : null,
    consecutiveWeeksAtStatus: consecutiveWeeks,
  };
}

// ---------------------------------------------------------------------------
// 6. Total document count
// ---------------------------------------------------------------------------

/** Count total documents for a category in a given week (7-day window). */
export async function getTotalDocumentCount(category: string, weekOf: string): Promise<number> {
  if (!isDbAvailable()) return 0;
  const db = getDb();
  const weekEnd = addDays(weekOf, 7);
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM documents
    WHERE category = ${category}
      AND published_at >= ${weekOf}::date AND published_at < ${weekEnd}::date
      AND retrieval_relevant IS NOT FALSE
  `);
  return ((rows.rows as Row[])[0]?.count as number) ?? 0;
}

/** Count L2 assessments stored for a (category, weekOf). Used for narrative-data sanity checks. */
export async function countL2AssessmentsForCategoryWeek(
  category: string,
  weekOf: string,
): Promise<number> {
  if (!isDbAvailable()) return 0;
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM ai_document_assessments
    WHERE category = ${category} AND week_of = ${weekOf}::date
  `);
  return ((rows.rows as Row[])[0]?.count as number) ?? 0;
}

// ---------------------------------------------------------------------------
// 7. Trajectory table (for term summary)
// ---------------------------------------------------------------------------

/** Get all category-week convergence statuses within a date range. */
export async function getTrajectoryTable(
  fromDate: string,
  toDate: string,
): Promise<Array<{ category: string; weekOf: string; status: string }>> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT category, week_of, convergence_detail->>'status' AS status
    FROM weekly_aggregates
    WHERE week_of >= ${fromDate} AND week_of < ${toDate}
    ORDER BY category, week_of
  `);
  return (rows.rows as Row[]).map((r) => ({
    category: r.category as string,
    weekOf: String(r.week_of).slice(0, 10),
    status: (r.status as string) ?? 'unknown',
  }));
}

// ---------------------------------------------------------------------------
// 8. Term statistics (composed from sub-queries)
// ---------------------------------------------------------------------------

async function queryWeeksPerStatus(fromDate: string, toDate: string) {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT category,
      COUNT(*) FILTER (WHERE convergence_detail->>'status' = 'Stable')::int AS stable,
      COUNT(*) FILTER (WHERE convergence_detail->>'status' = 'Elevated')::int AS elevated,
      COUNT(*) FILTER (WHERE convergence_detail->>'status' = 'Divergent')::int AS divergent,
      COUNT(*) FILTER (WHERE convergence_detail->>'status' = 'ConfirmedConcern')::int AS confirmed_concern
    FROM weekly_aggregates
    WHERE week_of >= ${fromDate} AND week_of < ${toDate}
    GROUP BY category ORDER BY category
  `);
  return (rows.rows as Row[]).map((r) => ({
    category: r.category as string,
    stable: (r.stable as number) ?? 0,
    elevated: (r.elevated as number) ?? 0,
    divergent: (r.divergent as number) ?? 0,
    confirmedConcern: (r.confirmed_concern as number) ?? 0,
  }));
}

async function queryPeakConvergenceWeek(fromDate: string, toDate: string) {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT week_of,
      COUNT(*) FILTER (
        WHERE convergence_detail->>'status' IN ('Elevated', 'Divergent', 'ConfirmedConcern')
      )::int AS elevated_count
    FROM weekly_aggregates
    WHERE week_of >= ${fromDate} AND week_of < ${toDate}
    GROUP BY week_of ORDER BY elevated_count DESC, week_of DESC LIMIT 1
  `);
  const row = (rows.rows as Row[])[0];
  return row && (row.elevated_count as number) > 0 ? String(row.week_of).slice(0, 10) : null;
}

async function queryCurrentTrend(toDate: string) {
  const db = getDb();
  const recentStart = addDays(toDate, -28);
  const priorStart = addDays(toDate, -56);
  const rows = await db.execute(sql`
    WITH recent AS (
      SELECT category, AVG(convergence_score)::float AS avg_score
      FROM weekly_aggregates WHERE week_of >= ${recentStart} AND week_of < ${toDate}
      GROUP BY category
    ), prior AS (
      SELECT category, AVG(convergence_score)::float AS avg_score
      FROM weekly_aggregates WHERE week_of >= ${priorStart} AND week_of < ${recentStart}
      GROUP BY category
    )
    SELECT r.category, r.avg_score AS recent_avg, p.avg_score AS prior_avg
    FROM recent r LEFT JOIN prior p ON p.category = r.category ORDER BY r.category
  `);
  return (rows.rows as Row[]).map((r) => {
    const delta = ((r.recent_avg as number) ?? 0) - ((r.prior_avg as number) ?? 0);
    let direction: 'improving' | 'stable' | 'worsening' = 'stable';
    if (delta > TREND_THRESHOLD) direction = 'worsening';
    else if (delta < -TREND_THRESHOLD) direction = 'improving';
    return { category: r.category as string, direction };
  });
}

/** Distinct substantive documents ingested this term (grounds the summary's
 *  corpus-size claim — the model previously invented "50,000+"). */
async function queryTermDocumentCount(fromDate: string): Promise<number> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT count(DISTINCT url)::int AS n
    FROM documents
    WHERE retrieval_relevant IS NOT FALSE
      AND content_type != 'metadata_only'
      AND published_at >= ${fromDate}
  `);
  return Number((rows.rows as Array<{ n: number }>)[0]?.n ?? 0);
}

/** Aggregate term-level statistics: status counts, peak week, and trend direction. */
export async function getTermStatistics(fromDate: string, toDate: string): Promise<TermStatistics> {
  if (!isDbAvailable()) {
    return {
      weeksPerStatus: [],
      peakConvergenceWeek: null,
      currentTrend: [],
      termDocumentCount: 0,
    };
  }
  const [weeksPerStatus, peakConvergenceWeek, currentTrend, termDocumentCount] = await Promise.all([
    queryWeeksPerStatus(fromDate, toDate),
    queryPeakConvergenceWeek(fromDate, toDate),
    queryCurrentTrend(toDate),
    queryTermDocumentCount(fromDate),
  ]);
  return { weeksPerStatus, peakConvergenceWeek, currentTrend, termDocumentCount };
}

// ---------------------------------------------------------------------------
// 9. Previous week narrative
// ---------------------------------------------------------------------------

/** Get the overview narrative from the week before the given weekOf. */
export async function getPreviousWeekNarrative(
  weekOf: string,
): Promise<{ expert: string; public: string } | null> {
  const previousWeek = addDays(weekOf, -7);
  const [expert, pub] = await Promise.all([
    getStoredNarrative(OVERVIEW_CATEGORY, previousWeek, 'expert'),
    getStoredNarrative(OVERVIEW_CATEGORY, previousWeek, 'public'),
  ]);
  if (!expert && !pub) return null;
  return { expert: expert?.content ?? '', public: pub?.content ?? '' };
}

// ---------------------------------------------------------------------------
// 10. Term narrative — moved to term-summary-queries.ts (living-summary data
// access: current summary, latest weekly, freshness, excerpts).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 11. Source health for the week
// ---------------------------------------------------------------------------

/** Get per-source fetch health for a category during a given week. */
export async function getSourceFetchHealth(
  category: string,
  weekOf: string,
): Promise<NarrativeSourceHealth[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT source_origin, status, items_fetched, errors
    FROM fetch_log
    WHERE category = ${category} AND week_start = ${weekOf}
    ORDER BY source_origin
  `);
  return (rows.rows as Row[]).map((r) => ({
    sourceOrigin: r.source_origin as string,
    status: r.status as string,
    itemsFetched: (r.items_fetched as number) ?? 0,
    errors: r.errors as string[] | null,
  }));
}

// ---------------------------------------------------------------------------
// 12. Thematic drift document grounding
// ---------------------------------------------------------------------------

/**
 * Get documents from the rolling 8-week window that are most representative
 * of the category's recent thematic centroid (nearest-neighbor by embedding).
 */
export async function getTypicalDocuments(
  category: string,
  weekOf: string,
  limit = 5,
): Promise<NarrativeThematicDocRef[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  // Compute rolling centroid from prior 8 weeks, then find nearest docs in that window
  const rows = await db.execute(sql`
    WITH rolling_centroid AS (
      SELECT AVG(embedding) AS centroid
      FROM documents
      WHERE category = ${category}
        AND published_at >= (${weekOf}::date - interval '56 days')
        AND published_at < ${weekOf}::date
        AND embedding IS NOT NULL
        AND retrieval_relevant IS NOT FALSE
    )
    SELECT d.title, d.source_type, d.published_at
    FROM documents d, rolling_centroid rc
    WHERE d.category = ${category}
      AND d.published_at >= (${weekOf}::date - interval '56 days')
      AND d.published_at < ${weekOf}::date
      AND d.embedding IS NOT NULL
      AND d.retrieval_relevant IS NOT FALSE
      AND rc.centroid IS NOT NULL
    ORDER BY d.embedding <=> rc.centroid
    LIMIT ${limit}
  `);
  return (rows.rows as Row[]).map((r) => ({
    title: (r.title as string) ?? 'Untitled',
    sourceType: (r.source_type as string) ?? 'unknown',
    publishedAt: toDateStr(r.published_at),
  }));
}

/**
 * Get this week's documents that are furthest from the rolling centroid —
 * these are the documents most responsible for thematic drift.
 */
export async function getDriftDrivingDocuments(
  category: string,
  weekOf: string,
  limit = 5,
): Promise<NarrativeThematicDocRef[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const weekEnd = addDays(weekOf, 7);
  const rows = await db.execute(sql`
    WITH rolling_centroid AS (
      SELECT AVG(embedding) AS centroid
      FROM documents
      WHERE category = ${category}
        AND published_at >= (${weekOf}::date - interval '56 days')
        AND published_at < ${weekOf}::date
        AND embedding IS NOT NULL
        AND retrieval_relevant IS NOT FALSE
    )
    SELECT d.title, d.source_type, d.published_at
    FROM documents d, rolling_centroid rc
    WHERE d.category = ${category}
      AND d.published_at >= ${weekOf}::date AND d.published_at < ${weekEnd}::date
      AND d.embedding IS NOT NULL
      AND d.retrieval_relevant IS NOT FALSE
      AND rc.centroid IS NOT NULL
    ORDER BY d.embedding <=> rc.centroid DESC
    LIMIT ${limit}
  `);
  return (rows.rows as Row[]).map((r) => ({
    title: (r.title as string) ?? 'Untitled',
    sourceType: (r.source_type as string) ?? 'unknown',
    publishedAt: toDateStr(r.published_at),
  }));
}

/** Enrich a NarrativeLayerData with document context, baseline, trajectory, etc. */
export async function enrichCategoryData(data: NarrativeLayerData): Promise<void> {
  const l3Elevated = data.convergenceDetail?.thematicElevated === true;
  const [docs, flagged, breakdown, baseline, trajectory, docCount, sourceHealth] =
    await Promise.all([
      getTopConcerningDocuments(data.category, data.weekOf),
      getFlaggedRoutineDocs(data.category, data.weekOf),
      getSourceTypeBreakdown(data.category, data.weekOf),
      getBaselineContext(data.category),
      getTrajectory(data.category, data.weekOf),
      getTotalDocumentCount(data.category, data.weekOf),
      getSourceFetchHealth(data.category, data.weekOf),
    ]);

  if (docs.length > 0) data.documentContext = docs;
  if (flagged.length > 0) data.flaggedRoutineContext = flagged;
  if (breakdown.length > 0) data.sourceTypeBreakdown = breakdown;
  data.baselineContext = baseline;
  data.trajectory = trajectory;
  data.totalDocumentCount = docCount;
  if (sourceHealth.length > 0) data.sourceHealthContext = sourceHealth;

  // Thematic drift grounding — only when L3 is elevated
  if (l3Elevated) {
    const [typical, driftDriving] = await Promise.all([
      getTypicalDocuments(data.category, data.weekOf),
      getDriftDrivingDocuments(data.category, data.weekOf),
    ]);
    if (typical.length > 0) data.typicalDocuments = typical;
    if (driftDriving.length > 0) data.driftDrivingDocuments = driftDriving;
  }
}
