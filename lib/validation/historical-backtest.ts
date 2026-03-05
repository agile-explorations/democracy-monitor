import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { ConvergenceStatus } from '@/lib/types/structural';
import { getMonday, toDateString } from '@/lib/utils/date-utils';
import type { KnownEvent } from './known-events';

const CONVERGENCE_ORDER: ConvergenceStatus[] = [
  'Stable',
  'Elevated',
  'Divergent',
  'ConfirmedConcern',
];

/** Returns 0–3 numeric index for a ConvergenceStatus. */
export function convergenceIndex(status: ConvergenceStatus): number {
  const idx = CONVERGENCE_ORDER.indexOf(status);
  return idx >= 0 ? idx : 0;
}

/** Returns true if `actual` is at least as severe as `threshold`. */
export function convergenceStatusAtLeast(
  actual: ConvergenceStatus,
  threshold: ConvergenceStatus,
): boolean {
  return convergenceIndex(actual) >= convergenceIndex(threshold);
}

export interface WeekData {
  totalSeverity: number;
  status: ConvergenceStatus;
  structuralScore: number | null;
  aiScore: number | null;
  thematicScore: number | null;
}

export interface BacktestResult {
  period: string;
  category: string;
  weeklyScores: Array<{ weekOf: string } & WeekData>;
  peakWeek: string;
  peakScore: number;
  knownEvents: KnownEvent[];
  detectedEvents: KnownEvent[];
  missedEvents: KnownEvent[];
  falseAlarms: number;
  detectionRate: number;
}

/** Get the Monday (ISO week start) for a date string. Delegates to shared utility. */
export function getWeekMonday(dateStr: string): string {
  return getMonday(new Date(dateStr));
}

type WeeklyLookup = Map<string, Map<string, WeekData>>;

function buildWeeklyLookup(rows: Record<string, unknown>[]): WeeklyLookup {
  const weeklyData: WeeklyLookup = new Map();

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const category = r.category as string;
    const weekOf = toDateString(new Date(r.week_of as string));
    const totalSeverity = Number(r.total_severity ?? 0);
    const rawStatus = (r.status as string) ?? 'Stable';
    const status = CONVERGENCE_ORDER.includes(rawStatus as ConvergenceStatus)
      ? (rawStatus as ConvergenceStatus)
      : 'Stable';

    if (!weeklyData.has(category)) weeklyData.set(category, new Map());
    weeklyData.get(category)!.set(weekOf, {
      totalSeverity,
      status,
      structuralScore: r.structural_score != null ? Number(r.structural_score) : null,
      aiScore: r.ai_score != null ? Number(r.ai_score) : null,
      thematicScore: r.thematic_score != null ? Number(r.thematic_score) : null,
    });
  }

  return weeklyData;
}

function buildWeeklyTimeline(
  catData: Map<string, WeekData> | undefined,
): Array<{ weekOf: string } & WeekData> {
  if (!catData) return [];
  return [...catData.entries()]
    .map(([weekOf, data]) => ({ weekOf, ...data }))
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf));
}

function evaluateCategoryBacktest(
  catData: Map<string, WeekData> | undefined,
  catEvents: KnownEvent[],
  weeklyScores: Array<{ weekOf: string } & WeekData>,
): {
  peakWeek: string;
  peakScore: number;
  detectedEvents: KnownEvent[];
  missedEvents: KnownEvent[];
  falseAlarms: number;
  detectionRate: number;
} {
  let peakWeek = '';
  let peakScore = 0;
  for (const ws of weeklyScores) {
    if (ws.totalSeverity > peakScore) {
      peakScore = ws.totalSeverity;
      peakWeek = ws.weekOf;
    }
  }

  const detected: KnownEvent[] = [];
  const missed: KnownEvent[] = [];
  const eventWeeks = new Set<string>();

  for (const event of catEvents) {
    const monday = getWeekMonday(event.date);
    eventWeeks.add(monday);
    const weekData = catData?.get(monday);
    if (weekData && convergenceStatusAtLeast(weekData.status, event.expectedMinStatus)) {
      detected.push(event);
    } else {
      missed.push(event);
    }
  }

  let falseAlarms = 0;
  for (const ws of weeklyScores) {
    if (convergenceStatusAtLeast(ws.status, 'Divergent') && !eventWeeks.has(ws.weekOf)) {
      falseAlarms++;
    }
  }

  const detectionRate = catEvents.length > 0 ? detected.length / catEvents.length : 0;

  return {
    peakWeek,
    peakScore,
    detectedEvents: detected,
    missedEvents: missed,
    falseAlarms,
    detectionRate,
  };
}

/**
 * Run a backtest against historical data in the database.
 * Queries weekly_aggregates with convergence status, then compares against known events.
 */
export async function runBacktest(
  from: string,
  to: string,
  knownEvents: KnownEvent[],
): Promise<BacktestResult[]> {
  const db = getDb();

  const result = await db.execute(sql`
    SELECT category, week_of, total_severity,
      structural_score, ai_score, thematic_score,
      convergence_detail->>'status' as status
    FROM weekly_aggregates
    WHERE week_of >= ${from} AND week_of <= ${to}
    ORDER BY category, week_of
  `);

  const weeklyData = buildWeeklyLookup(result.rows);
  const eventCategories = [...new Set(knownEvents.map((e) => e.category))];

  return eventCategories.map((category) => {
    const catData = weeklyData.get(category);
    const catEvents = knownEvents.filter((e) => e.category === category);
    const weeklyScores = buildWeeklyTimeline(catData);
    const evaluation = evaluateCategoryBacktest(catData, catEvents, weeklyScores);

    return {
      period: `${from} to ${to}`,
      category,
      weeklyScores,
      ...evaluation,
      knownEvents: catEvents,
    };
  });
}
