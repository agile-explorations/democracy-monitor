import { and, eq, inArray, sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { baselines, narratives, weeklyAggregates } from '@/lib/db/schema';
import { PRIMARY_BASELINE_ID } from '@/lib/methodology/scoring-config';
import {
  buildConvergenceSummary,
  extractNarrativeExcerpt,
  toDateKey,
} from '@/lib/services/category-summary-format';
import type { AIAssessmentSummary, ConcernLevel, ConcernAssessment } from '@/lib/types/structural';
import { latestCompleteWeek } from '@/lib/utils/date-utils';

const SPARKLINE_WEEKS = 8;

export interface CategorySummary {
  category: string;
  title: string;
  convergenceStatus: ConcernLevel | null;
  structuralScore: number | null;
  aiScore: number | null;
  thematicScore: number | null;
  structuralElevated: boolean;
  aiElevated: boolean;
  thematicElevated: boolean;
  baselineAvg: number;
  baselineStdDev: number;
  sparklineData: Array<{ week: string; score: number }>;
  documentCount: number;
  l2FlagCount: number;
  summary: string;
  /** Week the convergence data describes (YYYY-MM-DD) — used to link to the documents. */
  weekOf: string | null;
  /** First paragraph of the week's public narrative, when one exists. */
  narrativeExcerpt: string | null;
  computedAt: string | null;
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

/** Fetch N weeks of weekly aggregates per category for sparkline rendering. */
async function fetchSparklineData(
  db: ReturnType<typeof getDb>,
  weekOf?: string,
): Promise<Record<string, Array<{ week: string; score: number; docCount: number }>>> {
  const rows = await db.execute(sql`
    SELECT category, week_of, convergence_score, document_count
    FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY category ORDER BY week_of DESC
      ) AS rn
      FROM weekly_aggregates
      WHERE convergence_detail IS NOT NULL
        AND week_of <= ${weekOf ?? latestCompleteWeek()}
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
      score: Number(r.convergence_score ?? 0),
      docCount: Number(r.document_count),
    });
  }
  return result;
}

interface ConvergenceRow {
  synthesis: ConcernAssessment;
  structuralScore: number | null;
  aiScore: number | null;
  thematicScore: number | null;
  computedAt: string;
  weekOf: string;
  l2FlagCount: number;
  l2ConcerningCount: number;
  documentCount: number;
}

/** Fetch convergence synthesis + layer scores per category from weekly_aggregates. */
async function fetchLatestConvergence(
  db: ReturnType<typeof getDb>,
  weekOf?: string,
): Promise<Record<string, ConvergenceRow>> {
  const rows = weekOf
    ? await db.execute(sql`
        SELECT category, week_of, convergence_detail, structural_score, ai_score,
               thematic_score, computed_at, ai_detail, document_count
        FROM weekly_aggregates
        WHERE convergence_detail IS NOT NULL
          AND week_of = ${weekOf}
        ORDER BY category
      `)
    : await db.execute(sql`
        SELECT DISTINCT ON (category) category, week_of, convergence_detail, structural_score,
               ai_score, thematic_score, computed_at, ai_detail, document_count
        FROM weekly_aggregates
        WHERE convergence_detail IS NOT NULL
          AND week_of <= ${latestCompleteWeek()}
        ORDER BY category, week_of DESC
      `);

  const result: Record<string, ConvergenceRow> = {};
  for (const row of rows.rows) {
    const r = row as Record<string, unknown>;
    const detail = r.convergence_detail as ConcernAssessment | null;
    if (detail) {
      const aiDetail = r.ai_detail as AIAssessmentSummary | null;
      const dist = aiDetail?.concernDistribution;
      result[r.category as string] = {
        synthesis: detail,
        structuralScore: r.structural_score != null ? Number(r.structural_score) : null,
        aiScore: r.ai_score != null ? Number(r.ai_score) : null,
        thematicScore: r.thematic_score != null ? Number(r.thematic_score) : null,
        computedAt: r.computed_at ? new Date(r.computed_at as string).toISOString() : '',
        weekOf: toDateKey(r.week_of),
        l2FlagCount: aiDetail?.flagCount ?? 0,
        l2ConcerningCount: dist ? dist.potentiallyConcerning + dist.clearlyConcerning : 0,
        documentCount: Number(r.document_count ?? 0),
      };
    }
  }
  return result;
}

/**
 * Fetch first-paragraph excerpts of public narratives for the given
 * (category, week) pairs, keyed by `${category}|${weekOf}`.
 */
async function fetchNarrativeExcerpts(
  db: ReturnType<typeof getDb>,
  pairs: Array<{ category: string; weekOf: string }>,
): Promise<Record<string, string>> {
  if (pairs.length === 0) return {};

  const rows = await db
    .select({
      category: narratives.category,
      weekOf: narratives.weekOf,
      content: narratives.content,
    })
    .from(narratives)
    .where(
      and(
        eq(narratives.version, 'public'),
        inArray(
          narratives.category,
          pairs.map((p) => p.category),
        ),
        inArray(narratives.weekOf, [...new Set(pairs.map((p) => p.weekOf))]),
      ),
    );

  const wanted = new Set(pairs.map((p) => `${p.category}|${p.weekOf}`));
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = `${row.category}|${toDateKey(row.weekOf)}`;
    if (wanted.has(key)) result[key] = extractNarrativeExcerpt(row.content);
  }
  return result;
}

/**
 * Build category summaries from weekly_aggregates convergence data + baselines.
 * When weekOf is provided, data is scoped to that specific week.
 */
export async function getCategorySummaries(weekOf?: string): Promise<CategorySummary[]> {
  const db = getDb();

  const [baselineData, sparklineData, convergenceData] = await Promise.all([
    fetchBaselines(db),
    fetchSparklineData(db, weekOf),
    fetchLatestConvergence(db, weekOf),
  ]);

  const excerpts = await fetchNarrativeExcerpts(
    db,
    Object.entries(convergenceData).map(([category, row]) => ({
      category,
      weekOf: row.weekOf,
    })),
  );

  return CATEGORIES.map((cat) => {
    const baseline = baselineData[cat.key] ?? { avg: 0, stddev: 0 };
    const sparkline = sparklineData[cat.key] ?? [];
    const row = convergenceData[cat.key] ?? null;
    const convergence = row?.synthesis ?? null;

    const latestWeek = sparkline[sparkline.length - 1];

    return {
      category: cat.key,
      title: cat.title,
      convergenceStatus: convergence?.status ?? null,
      structuralScore: row?.structuralScore ?? null,
      aiScore: row?.aiScore ?? null,
      thematicScore: row?.thematicScore ?? null,
      structuralElevated: convergence?.structuralElevated ?? false,
      aiElevated: convergence?.aiElevated ?? false,
      thematicElevated: convergence?.thematicElevated ?? false,
      baselineAvg: baseline.avg,
      baselineStdDev: baseline.stddev,
      sparklineData: sparkline.map((s) => ({ week: s.week, score: s.score })),
      documentCount: row?.documentCount ?? latestWeek?.docCount ?? 0,
      l2FlagCount: row?.l2FlagCount ?? 0,
      summary:
        convergence && row
          ? buildConvergenceSummary(convergence, {
              flagged: row.l2FlagCount,
              concerning: row.l2ConcerningCount,
              total: row.documentCount,
            })
          : cat.description,
      weekOf: row?.weekOf ?? null,
      narrativeExcerpt: row ? (excerpts[`${cat.key}|${row.weekOf}`] ?? null) : null,
      computedAt: row?.computedAt ?? null,
    };
  });
}
