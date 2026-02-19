import { eq, sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { baselines, weeklyAggregates } from '@/lib/db/schema';
import { PRIMARY_BASELINE_ID } from '@/lib/methodology/scoring-config';
import type { StatusLevel } from '@/lib/types';

const SPARKLINE_WEEKS = 8;

export interface CategorySummary {
  category: string;
  title: string;
  status: StatusLevel;
  decayWeightedScore: number;
  baselineAvg: number;
  baselineStdDev: number;
  sparklineData: Array<{ week: string; score: number }>;
  documentCount: number;
  flaggedCount: number;
  summary: string;
  assessedAt: string | null;
}

/** Fetch latest assessment status per category via DISTINCT ON. */
async function fetchLatestAssessments(
  db: ReturnType<typeof getDb>,
): Promise<Record<string, { status: string; reason: string; assessedAt: Date; matches: unknown }>> {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (category) category, status, reason, assessed_at, matches
    FROM assessments
    ORDER BY category, assessed_at DESC
  `);

  const result: Record<
    string,
    { status: string; reason: string; assessedAt: Date; matches: unknown }
  > = {};
  for (const row of rows.rows) {
    const r = row as Record<string, unknown>;
    result[r.category as string] = {
      status: r.status as string,
      reason: r.reason as string,
      assessedAt: new Date(r.assessed_at as string),
      matches: r.matches,
    };
  }
  return result;
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

/** Fetch last N weeks of weekly aggregates per category. */
async function fetchSparklineData(
  db: ReturnType<typeof getDb>,
): Promise<Record<string, Array<{ week: string; score: number; docCount: number }>>> {
  const rows = await db.execute(sql`
    SELECT category, week_of, total_severity, document_count
    FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY category ORDER BY week_of DESC
      ) AS rn
      FROM weekly_aggregates
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

/**
 * Build category summaries combining static metadata, latest assessments,
 * baselines, and sparkline data.
 */
export async function getCategorySummaries(): Promise<CategorySummary[]> {
  const db = getDb();

  const [latestAssessments, baselineData, sparklineData] = await Promise.all([
    fetchLatestAssessments(db),
    fetchBaselines(db),
    fetchSparklineData(db),
  ]);

  return CATEGORIES.map((cat) => {
    const assessment = latestAssessments[cat.key];
    const baseline = baselineData[cat.key] ?? { avg: 0, stddev: 0 };
    const sparkline = sparklineData[cat.key] ?? [];

    const latestWeek = sparkline[sparkline.length - 1];
    const matches = assessment?.matches;
    const flaggedCount = Array.isArray(matches) ? matches.length : 0;

    return {
      category: cat.key,
      title: cat.title,
      status: (assessment?.status ?? 'Stable') as StatusLevel,
      decayWeightedScore: latestWeek?.score ?? 0,
      baselineAvg: baseline.avg,
      baselineStdDev: baseline.stddev,
      sparklineData: sparkline.map((s) => ({ week: s.week, score: s.score })),
      documentCount: latestWeek?.docCount ?? 0,
      flaggedCount,
      summary: assessment?.reason ?? 'No assessment data available.',
      assessedAt: assessment?.assessedAt?.toISOString() ?? null,
    };
  });
}
