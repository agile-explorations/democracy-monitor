import { desc, sql } from 'drizzle-orm';
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

const DEFAULT_WEEKS = 16;
const ELEVATED_STATUSES = new Set<ConvergenceStatus>(['Elevated', 'Divergent', 'ConfirmedConcern']);

interface AggregateRow {
  category: string;
  week_of: string;
  convergence_score: number | null;
  convergence_detail: unknown;
  structural_detail: unknown;
}

/** Fetch recent weekly_aggregates rows for all categories. */
async function fetchRecentAggregates(weeks: number): Promise<AggregateRow[]> {
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
      sql`${weeklyAggregates.weekOf} >= (
        SELECT MAX(week_of) - make_interval(days => ${weeks * 7})
        FROM weekly_aggregates
      )`,
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

/** Extract convergence status from JSONB detail, defaulting to Stable. */
function parseStatus(detail: unknown): ConvergenceStatus {
  if (!detail || typeof detail !== 'object') return 'Stable';
  const d = detail as Partial<ConvergenceSynthesis>;
  const s = d.status;
  if (s === 'Elevated' || s === 'Divergent' || s === 'ConfirmedConcern') return s;
  return 'Stable';
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
  for (const week of allWeeks) weekElevatedCounts.set(week, 0);

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
      score: weekMap.get(w)?.convergence_score ?? 0,
    }));
    heatmap.push({ category: cat.key, title: cat.title, weeks });

    const segments = allWeeks.map((w) => ({
      week: w,
      status: parseStatus(weekMap.get(w)?.convergence_detail),
    }));
    statusTimeline.push({ category: cat.key, title: cat.title, segments });

    for (const seg of segments) {
      if (ELEVATED_STATUSES.has(seg.status)) {
        weekElevatedCounts.set(seg.week, (weekElevatedCounts.get(seg.week) ?? 0) + 1);
      }
    }

    const latestStatus = parseStatus(weekMap.get(latestWeek)?.convergence_detail);
    statusCounts[latestStatus]++;
  }

  return { heatmap, statusTimeline, weekElevatedCounts, statusCounts };
}

/** Build heatmap, timeline, synchrony, and statusCounts from raw rows. */
export function buildOverviewFromRows(rows: AggregateRow[]): Omit<OverviewSummary, 'weekRange'> {
  const byCat = new Map<string, AggregateRow[]>();
  for (const row of rows) {
    const arr = byCat.get(row.category) ?? [];
    arr.push(row);
    byCat.set(row.category, arr);
  }

  const weekSet = new Set<string>();
  for (const row of rows) weekSet.add(row.week_of);
  const allWeeks = Array.from(weekSet).sort();
  const latestWeek = allWeeks[allWeeks.length - 1] ?? '';

  const { heatmap, statusTimeline, weekElevatedCounts, statusCounts } = buildCategoryRows(
    byCat,
    allWeeks,
    latestWeek,
  );

  const synchrony: SynchronyPoint[] = allWeeks.map((w) => ({
    week: w,
    elevatedCount: weekElevatedCounts.get(w) ?? 0,
  }));

  const driftOrder = buildDriftSortOrder(byCat, latestWeek);
  heatmap.sort((a, b) => (driftOrder.get(b.category) ?? 0) - (driftOrder.get(a.category) ?? 0));
  statusTimeline.sort(
    (a, b) => (driftOrder.get(b.category) ?? 0) - (driftOrder.get(a.category) ?? 0),
  );

  return { heatmap, statusTimeline, synchrony, statusCounts };
}

/** Extract longHorizon.cumulativeDeviation from structuralDetail for sorting. */
function buildDriftSortOrder(
  byCat: Map<string, AggregateRow[]>,
  latestWeek: string,
): Map<string, number> {
  const order = new Map<string, number>();
  for (const [cat, rows] of byCat) {
    const latest = rows.find((r) => r.week_of === latestWeek);
    const detail = latest?.structural_detail as Record<string, unknown> | null;
    const longHorizon = detail?.longHorizon as Record<string, unknown> | null;
    order.set(cat, Number(longHorizon?.cumulativeDeviation ?? 0));
  }
  return order;
}

/** Fetch overview summary from DB. */
export async function getOverviewSummary(weeks = DEFAULT_WEEKS): Promise<OverviewSummary> {
  const rows = await fetchRecentAggregates(weeks);
  const result = buildOverviewFromRows(rows);

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
