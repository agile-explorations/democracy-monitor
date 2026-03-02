import { eq, sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { baselines, weeklyAggregates } from '@/lib/db/schema';
import { PRIMARY_BASELINE_ID } from '@/lib/methodology/scoring-config';
import type { StatusLevel } from '@/lib/types';
import type { ConvergenceStatus, ConvergenceSynthesis } from '@/lib/types/structural';

const SPARKLINE_WEEKS = 8;

interface AssessmentRow {
  status: string;
  reason: string;
  assessedAt: Date;
  matches: unknown;
  insufficientData: boolean;
}

function parseAssessmentRows(rows: { rows: unknown[] }): Record<string, AssessmentRow> {
  const result: Record<string, AssessmentRow> = {};
  for (const row of rows.rows) {
    const r = row as Record<string, unknown>;
    const detail = r.detail as Record<string, unknown> | null;
    result[r.category as string] = {
      status: r.status as string,
      reason: r.reason as string,
      assessedAt: new Date(r.assessed_at as string),
      matches: r.matches,
      insufficientData: detail?.insufficientData === true,
    };
  }
  return result;
}

export interface CategorySummary {
  category: string;
  title: string;
  status: StatusLevel;
  insufficientData: boolean;
  decayWeightedScore: number;
  baselineAvg: number;
  baselineStdDev: number;
  sparklineData: Array<{ week: string; score: number }>;
  documentCount: number;
  flaggedCount: number;
  summary: string;
  assessedAt: string | null;
  convergenceStatus: ConvergenceStatus | null;
  structuralElevated: boolean;
  aiElevated: boolean;
  thematicElevated: boolean;
}

/** Fetch assessment status per category. When weekOf is provided, prefer assessments within that week. */
async function fetchLatestAssessments(
  db: ReturnType<typeof getDb>,
  weekOf?: string,
): Promise<Record<string, AssessmentRow>> {
  const rows = weekOf
    ? await db.execute(sql`
        SELECT DISTINCT ON (category) category, status, reason, assessed_at, matches, detail
        FROM assessments
        WHERE assessed_at >= ${weekOf}::date
          AND assessed_at < (${weekOf}::date + interval '7 days')
        ORDER BY category, assessed_at DESC
      `)
    : await db.execute(sql`
        SELECT DISTINCT ON (category) category, status, reason, assessed_at, matches, detail
        FROM assessments
        ORDER BY category, assessed_at DESC
      `);
  return parseAssessmentRows(rows);
}

/** Fetch baseline avg/stddev per category for the primary baseline. */
async function fetchBaselines(
  db: ReturnType<typeof getDb>,
): Promise<Record<string, { avg: number; stddev: number }>> {
  const rows = await db
    .select({
      category: baselines.category,
      avg: baselines.avgWeeklySeverity,
      stddev: baselines.stddevWeeklySeverity,
    })
    .from(baselines)
    .where(eq(baselines.baselineId, PRIMARY_BASELINE_ID));

  const result: Record<string, { avg: number; stddev: number }> = {};
  for (const row of rows) {
    result[row.category] = { avg: row.avg, stddev: row.stddev };
  }
  return result;
}

/** Fetch N weeks of weekly aggregates per category. When weekOf is provided, the trailing window ends at that week. */
async function fetchSparklineData(
  db: ReturnType<typeof getDb>,
  weekOf?: string,
): Promise<Record<string, Array<{ week: string; score: number; docCount: number }>>> {
  const rows = await db.execute(sql`
    SELECT category, week_of, total_severity, document_count
    FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY category ORDER BY week_of DESC
      ) AS rn
      FROM weekly_aggregates
      ${weekOf ? sql`WHERE week_of <= ${weekOf}` : sql``}
    ) sub
    WHERE rn <= ${SPARKLINE_WEEKS}
    ORDER BY category, week_of ASC
  `);

  const result: Record<string, Array<{ week: string; score: number; docCount: number }>> = {};
  for (const row of rows.rows) {
    const r = row as Record<string, unknown>;
    const cat = r.category as string;
    if (!result[cat]) result[cat] = [];
    result[cat].push({
      week: r.week_of as string,
      score: Number(r.total_severity),
      docCount: Number(r.document_count),
    });
  }
  return result;
}

/** Fetch convergence synthesis per category. When weekOf is provided, use that specific week. */
async function fetchLatestConvergence(
  db: ReturnType<typeof getDb>,
  weekOf?: string,
): Promise<Record<string, ConvergenceSynthesis>> {
  const rows = weekOf
    ? await db.execute(sql`
        SELECT category, convergence_detail
        FROM weekly_aggregates
        WHERE convergence_detail IS NOT NULL
          AND week_of = ${weekOf}
        ORDER BY category
      `)
    : await db.execute(sql`
        SELECT DISTINCT ON (category) category, convergence_detail
        FROM weekly_aggregates
        WHERE convergence_detail IS NOT NULL
        ORDER BY category, week_of DESC
      `);

  const result: Record<string, ConvergenceSynthesis> = {};
  for (const row of rows.rows) {
    const r = row as Record<string, unknown>;
    const detail = r.convergence_detail as ConvergenceSynthesis | null;
    if (detail) {
      result[r.category as string] = detail;
    }
  }
  return result;
}

/**
 * Build category summaries combining static metadata, assessments,
 * baselines, and sparkline data.
 * When weekOf is provided, data is scoped to that specific week.
 */
export async function getCategorySummaries(weekOf?: string): Promise<CategorySummary[]> {
  const db = getDb();

  const [latestAssessments, baselineData, sparklineData, convergenceData] = await Promise.all([
    fetchLatestAssessments(db, weekOf),
    fetchBaselines(db),
    fetchSparklineData(db, weekOf),
    fetchLatestConvergence(db, weekOf),
  ]);

  return CATEGORIES.map((cat) => {
    const assessment = latestAssessments[cat.key];
    const baseline = baselineData[cat.key] ?? { avg: 0, stddev: 0 };
    const sparkline = sparklineData[cat.key] ?? [];
    const convergence = convergenceData[cat.key] ?? null;

    const latestWeek = sparkline[sparkline.length - 1];
    const matches = assessment?.matches;
    const flaggedCount = Array.isArray(matches) ? matches.length : 0;

    return {
      category: cat.key,
      title: cat.title,
      status: (assessment?.status ?? 'Stable') as StatusLevel,
      insufficientData: assessment?.insufficientData ?? false,
      decayWeightedScore: latestWeek?.score ?? 0,
      baselineAvg: baseline.avg,
      baselineStdDev: baseline.stddev,
      sparklineData: sparkline.map((s) => ({ week: s.week, score: s.score })),
      documentCount: latestWeek?.docCount ?? 0,
      flaggedCount,
      summary: assessment?.reason ?? 'No assessment data available.',
      assessedAt: assessment?.assessedAt?.toISOString() ?? null,
      convergenceStatus: convergence?.status ?? null,
      structuralElevated: convergence?.structuralElevated ?? false,
      aiElevated: convergence?.aiElevated ?? false,
      thematicElevated: convergence?.thematicElevated ?? false,
    };
  });
}
