import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import type {
  NarrativeBaselineContext,
  NarrativeDocumentContext,
  NarrativeFlaggedDocContext,
  NarrativeLayerData,
  NarrativeTrajectory,
  SourceTypeBreakdown,
  TermStatistics,
} from '@/lib/types';
import { OVERVIEW_CATEGORY, TERM_SUMMARY_CATEGORY } from '@/lib/types';
import { getStoredNarrative } from './narrative-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIDEN_2022_START = '2022-01-20';
const BIDEN_2022_END = '2023-01-20';
const TREND_THRESHOLD = 0.05;

type Row = Record<string, unknown>;

/** Offset a YYYY-MM-DD date string by a number of days. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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
      a2.assessment, a2.erosion_type, a2.reasoning,
      LEFT(d.content, 2000) AS content
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
  return (rows.rows as Row[]).map((r) => ({
    title: (r.title as string) ?? 'Untitled',
    sourceType: (r.source_type as string) ?? 'unknown',
    sourceOrigin: r.source_origin as string | null,
    agency: r.agency as string | null,
    publishedAt: toDateStr(r.published_at),
    url: (r.url as string) ?? '',
    assessment: (r.assessment as string) ?? 'unknown',
    erosionType: r.erosion_type as string | null,
    reasoning: r.reasoning as string | null,
    content: r.content as string | null,
  }));
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
  if (!isDbAvailable()) return { previousWeekStatus: null, consecutiveWeeksAtStatus: 0 };
  const db = getDb();
  const currentRows = await db.execute(sql`
    SELECT convergence_detail->>'status' AS status
    FROM weekly_aggregates WHERE category = ${category} AND week_of = ${weekOf} LIMIT 1
  `);
  const currentStatus = (currentRows.rows as Row[])[0]?.status as string | null;
  const historyRows = await db.execute(sql`
    SELECT convergence_detail->>'status' AS status
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
  return {
    previousWeekStatus: history.length > 0 ? (history[0].status as string | null) : null,
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

/** Aggregate term-level statistics: status counts, peak week, and trend direction. */
export async function getTermStatistics(fromDate: string, toDate: string): Promise<TermStatistics> {
  if (!isDbAvailable()) {
    return { weeksPerStatus: [], peakConvergenceWeek: null, currentTrend: [] };
  }
  const [weeksPerStatus, peakConvergenceWeek, currentTrend] = await Promise.all([
    queryWeeksPerStatus(fromDate, toDate),
    queryPeakConvergenceWeek(fromDate, toDate),
    queryCurrentTrend(toDate),
  ]);
  return { weeksPerStatus, peakConvergenceWeek, currentTrend };
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
// 10. Term narrative
// ---------------------------------------------------------------------------

/** Get the latest term summary narrative (both versions). */
export async function getTermNarrative(): Promise<{ expert: string; public: string } | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();
  const latest = await db.execute(sql`
    SELECT week_of FROM narratives
    WHERE category = ${TERM_SUMMARY_CATEGORY} AND version = 'expert'
    ORDER BY week_of DESC LIMIT 1
  `);
  const latestRow = (latest.rows as Row[])[0];
  if (!latestRow) return null;
  const latestWeek = String(latestRow.week_of).slice(0, 10);
  const [expert, pub] = await Promise.all([
    getStoredNarrative(TERM_SUMMARY_CATEGORY, latestWeek, 'expert'),
    getStoredNarrative(TERM_SUMMARY_CATEGORY, latestWeek, 'public'),
  ]);
  if (!expert && !pub) return null;
  return { expert: expert?.content ?? '', public: pub?.content ?? '' };
}

/** Enrich a NarrativeLayerData with document context, baseline, trajectory, etc. */
export async function enrichCategoryData(data: NarrativeLayerData): Promise<void> {
  const [docs, flagged, breakdown, baseline, trajectory, docCount] = await Promise.all([
    getTopConcerningDocuments(data.category, data.weekOf),
    getFlaggedRoutineDocs(data.category, data.weekOf),
    getSourceTypeBreakdown(data.category, data.weekOf),
    getBaselineContext(data.category),
    getTrajectory(data.category, data.weekOf),
    getTotalDocumentCount(data.category, data.weekOf),
  ]);

  if (docs.length > 0) data.documentContext = docs;
  if (flagged.length > 0) data.flaggedRoutineContext = flagged;
  if (breakdown.length > 0) data.sourceTypeBreakdown = breakdown;
  data.baselineContext = baseline;
  data.trajectory = trajectory;
  data.totalDocumentCount = docCount;
}
