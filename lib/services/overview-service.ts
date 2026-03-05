import { desc, sql } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import type { ConvergenceStatus } from '@/lib/types';
import type {
  HeatmapRow,
  OverviewSummary,
  StatusTimelineEntry,
  SynchronyPoint,
} from '@/lib/types/overview';
import type { ConvergenceSynthesis } from '@/lib/types/structural';
import { latestCompleteWeek } from '@/lib/utils/date-utils';
import { movingAverage } from '@/lib/utils/math';

/** Weeks since inauguration (Jan 20, 2025) — used as default overview window. */
const ADMIN_START = new Date('2025-01-20T00:00:00Z');
function weeksSinceAdminStart(): number {
  const now = new Date();
  const diffMs = now.getTime() - ADMIN_START.getTime();
  return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

const ELEVATED_STATUSES = new Set<ConvergenceStatus>(['Elevated', 'Divergent', 'ConfirmedConcern']);

const STATUS_WEIGHT: Record<ConvergenceStatus, number> = {
  Stable: 0,
  Elevated: 1,
  Divergent: 2,
  ConfirmedConcern: 3,
};

interface AggregateRow {
  category: string;
  week_of: string;
  convergence_score: number | null;
  convergence_detail: unknown;
  structural_detail: unknown;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const COMPARISON_TREND_WINDOW = 4;

/** Get inauguration date (cycleYear 1 start) for an administration. */
function getInaugurationDate(administration: string): string | null {
  const config = BASELINE_CONFIGS.find(
    (c) => c.administration === administration && c.cycleYear === 1,
  );
  return config?.from ?? null;
}

/** Get combined date range across all baseline configs for an administration. */
function getPeriodRange(administration: string): { from: string; to: string } | null {
  const configs = BASELINE_CONFIGS.filter((c) => c.administration === administration);
  if (configs.length === 0) return null;
  let from = configs[0].from;
  let to = configs[0].to;
  for (const c of configs) {
    if (c.from < from) from = c.from;
    if (c.to > to) to = c.to;
  }
  return { from, to };
}

/** Compute week offset (0-based) from a period start date. */
function weekOffset(weekDate: string, periodStart: string): number {
  const d = new Date(weekDate + 'T00:00:00Z');
  const s = new Date(periodStart + 'T00:00:00Z');
  return Math.round((d.getTime() - s.getTime()) / MS_PER_WEEK);
}

/** Apply moving-average smoothing to scores indexed by week offset. */
function smoothByOffset(scores: Map<number, number>, window: number): Map<number, number> {
  if (scores.size === 0) return new Map();
  const sortedOffsets = Array.from(scores.keys()).sort((a, b) => a - b);
  const values = sortedOffsets.map((o) => scores.get(o)!);
  const smoothed = movingAverage(values, window);
  const result = new Map<number, number>();
  for (let i = 0; i < sortedOffsets.length; i++) {
    result.set(sortedOffsets[i], smoothed[i]);
  }
  return result;
}

/**
 * Group aggregate rows by week, compute weighted concern score per week,
 * and index by week offset from periodStart.
 * Pure function — no I/O.
 */
export function computeWeeklyWeightedScores(
  rows: AggregateRow[],
  periodStart: string,
): Map<number, number> {
  const byWeek = new Map<string, AggregateRow[]>();
  for (const row of rows) {
    const arr = byWeek.get(row.week_of) ?? [];
    arr.push(row);
    byWeek.set(row.week_of, arr);
  }

  const result = new Map<number, number>();
  const sortedWeeks = Array.from(byWeek.keys()).sort();
  for (const week of sortedWeeks) {
    const weekRows = byWeek.get(week)!;
    let weightedScore = 0;
    for (const row of weekRows) {
      const status = parseStatus(row.convergence_detail);
      if (status) weightedScore += STATUS_WEIGHT[status];
    }
    const offset = weekOffset(week, periodStart);
    result.set(offset, weightedScore);
  }

  return result;
}

/** Fetch recent weekly_aggregates rows for all categories (excludes current in-progress week). */
async function fetchRecentAggregates(weeks: number): Promise<AggregateRow[]> {
  const db = getDb();
  const cutoff = latestCompleteWeek();
  const rows = await db
    .select({
      category: weeklyAggregates.category,
      weekOf: weeklyAggregates.weekOf,
      convergenceScore: weeklyAggregates.convergenceScore,
      convergenceDetail: weeklyAggregates.convergenceDetail,
      structuralDetail: weeklyAggregates.structuralDetail,
    })
    .from(weeklyAggregates)
    .where(
      sql`${weeklyAggregates.weekOf} >= (
        SELECT MAX(week_of) - make_interval(days => ${weeks * 7})
        FROM weekly_aggregates
        WHERE week_of <= ${cutoff}
      ) AND ${weeklyAggregates.weekOf} <= ${cutoff}`,
    )
    .orderBy(weeklyAggregates.category, desc(weeklyAggregates.weekOf));

  return rows.map((r) => ({
    category: r.category,
    week_of: r.weekOf,
    convergence_score: r.convergenceScore,
    convergence_detail: r.convergenceDetail,
    structural_detail: r.structuralDetail,
  }));
}

/** Fetch weekly_aggregates rows for a date range. */
async function fetchPeriodAggregates(from: string, to: string): Promise<AggregateRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      category: weeklyAggregates.category,
      weekOf: weeklyAggregates.weekOf,
      convergenceScore: weeklyAggregates.convergenceScore,
      convergenceDetail: weeklyAggregates.convergenceDetail,
      structuralDetail: weeklyAggregates.structuralDetail,
    })
    .from(weeklyAggregates)
    .where(
      sql`${weeklyAggregates.weekOf} >= ${from}
        AND ${weeklyAggregates.weekOf} <= ${to}`,
    )
    .orderBy(weeklyAggregates.category, desc(weeklyAggregates.weekOf));

  return rows.map((r) => ({
    category: r.category,
    week_of: r.weekOf,
    convergence_score: r.convergenceScore,
    convergence_detail: r.convergenceDetail,
    structural_detail: r.structuralDetail,
  }));
}

/** Extract convergence status from JSONB detail, returning null when not computed. */
function parseStatus(detail: unknown): ConvergenceStatus | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as Partial<ConvergenceSynthesis>;
  const s = d.status;
  if (s === 'Elevated' || s === 'Divergent' || s === 'ConfirmedConcern') return s;
  if (s === 'Stable') return 'Stable';
  return null;
}

type ElevatedStatus = 'Elevated' | 'Divergent' | 'ConfirmedConcern';

/** Accumulate elevated and per-status counts from a category's segments. */
function accumulateSegmentCounts(
  segments: Array<{ week: string; status: ConvergenceStatus | null }>,
  weekElevatedCounts: Map<string, number>,
  weekStatusCounts: Map<string, Record<ElevatedStatus, number>>,
) {
  for (const seg of segments) {
    if (seg.status && ELEVATED_STATUSES.has(seg.status)) {
      weekElevatedCounts.set(seg.week, (weekElevatedCounts.get(seg.week) ?? 0) + 1);
      const counts = weekStatusCounts.get(seg.week);
      if (counts && seg.status !== 'Stable') counts[seg.status as ElevatedStatus]++;
    }
  }
}

/** Build per-category heatmap/timeline rows and accumulate elevated counts. */
function buildCategoryRows(
  byCat: Map<string, AggregateRow[]>,
  allWeeks: string[],
  latestWeek: string,
) {
  const heatmap: HeatmapRow[] = [];
  const statusTimeline: StatusTimelineEntry[] = [];
  const weekElevatedCounts = new Map<string, number>();
  const weekStatusCounts = new Map<
    string,
    Record<'Elevated' | 'Divergent' | 'ConfirmedConcern', number>
  >();
  for (const week of allWeeks) {
    weekElevatedCounts.set(week, 0);
    weekStatusCounts.set(week, { Elevated: 0, Divergent: 0, ConfirmedConcern: 0 });
  }

  const statusCounts: Record<ConvergenceStatus, number> = {
    Stable: 0,
    Elevated: 0,
    Divergent: 0,
    ConfirmedConcern: 0,
  };

  for (const cat of CATEGORIES) {
    const catRows = byCat.get(cat.key) ?? [];
    const weekMap = new Map<string, AggregateRow>();
    for (const r of catRows) weekMap.set(r.week_of, r);

    const weeks = allWeeks.map((w) => ({
      week: w,
      score: weekMap.get(w)?.convergence_score ?? null,
    }));
    heatmap.push({ category: cat.key, title: cat.title, weeks });

    const segments = allWeeks.map((w) => ({
      week: w,
      status: parseStatus(weekMap.get(w)?.convergence_detail),
    }));
    statusTimeline.push({ category: cat.key, title: cat.title, segments });

    accumulateSegmentCounts(segments, weekElevatedCounts, weekStatusCounts);

    const latestStatus = parseStatus(weekMap.get(latestWeek)?.convergence_detail) ?? 'Stable';
    statusCounts[latestStatus]++;
  }

  return { heatmap, statusTimeline, weekElevatedCounts, weekStatusCounts, statusCounts };
}

/** Build heatmap, timeline, synchrony, and statusCounts from raw rows. */
export function buildOverviewFromRows(rows: AggregateRow[]): Omit<OverviewSummary, 'weekRange'> {
  const byCat = new Map<string, AggregateRow[]>();
  for (const row of rows) {
    const arr = byCat.get(row.category) ?? [];
    arr.push(row);
    byCat.set(row.category, arr);
  }

  // Only include weeks where at least one category has convergence data
  const weeksWithConvergence = new Set<string>();
  for (const row of rows) {
    if (row.convergence_detail) weeksWithConvergence.add(row.week_of);
  }
  const allWeeks = Array.from(weeksWithConvergence).sort();
  const latestWeek = allWeeks[allWeeks.length - 1] ?? '';

  const { heatmap, statusTimeline, weekElevatedCounts, weekStatusCounts, statusCounts } =
    buildCategoryRows(byCat, allWeeks, latestWeek);

  const synchrony: SynchronyPoint[] = allWeeks.map((w) => {
    const counts = weekStatusCounts.get(w) ?? { Elevated: 0, Divergent: 0, ConfirmedConcern: 0 };
    const elevatedWeighted = counts.Elevated * STATUS_WEIGHT.Elevated;
    const divergentWeighted = counts.Divergent * STATUS_WEIGHT.Divergent;
    const confirmedWeighted = counts.ConfirmedConcern * STATUS_WEIGHT.ConfirmedConcern;
    return {
      week: w,
      elevatedCount: weekElevatedCounts.get(w) ?? 0,
      weightedScore: elevatedWeighted + divergentWeighted + confirmedWeighted,
      elevatedWeighted,
      divergentWeighted,
      confirmedWeighted,
    };
  });

  return { heatmap, statusTimeline, synchrony, statusCounts };
}

/** Fetch overview summary from DB, including historical comparison trends. */
export async function getOverviewSummary(weeks = weeksSinceAdminStart()): Promise<OverviewSummary> {
  const trumpInauguration = getInaugurationDate('trump');
  const bidenInauguration = getInaugurationDate('biden');
  const trumpRange = getPeriodRange('trump');
  const bidenRange = getPeriodRange('biden');

  const [rows, trumpRows, bidenRows] = await Promise.all([
    fetchRecentAggregates(weeks),
    trumpRange ? fetchPeriodAggregates(trumpRange.from, trumpRange.to) : Promise.resolve([]),
    bidenRange ? fetchPeriodAggregates(bidenRange.from, bidenRange.to) : Promise.resolve([]),
  ]);

  const result = buildOverviewFromRows(rows);

  const trumpScores = trumpInauguration
    ? computeWeeklyWeightedScores(trumpRows, trumpInauguration)
    : new Map<number, number>();
  const bidenScores = bidenInauguration
    ? computeWeeklyWeightedScores(bidenRows, bidenInauguration)
    : new Map<number, number>();

  const trumpSmoothed = smoothByOffset(trumpScores, COMPARISON_TREND_WINDOW);
  const bidenSmoothed = smoothByOffset(bidenScores, COMPARISON_TREND_WINDOW);

  const currentInauguration = '2025-01-20';
  for (const point of result.synchrony) {
    const offset = weekOffset(point.week, currentInauguration);
    point.trumpT1Trend = trumpSmoothed.get(offset) ?? null;
    point.bidenT1Trend = bidenSmoothed.get(offset) ?? null;
  }

  const weekSet = new Set(rows.map((r) => r.week_of));
  const sortedWeeks = Array.from(weekSet).sort();

  return {
    ...result,
    weekRange: {
      from: sortedWeeks[0] ?? '',
      to: sortedWeeks[sortedWeeks.length - 1] ?? '',
    },
  };
}
