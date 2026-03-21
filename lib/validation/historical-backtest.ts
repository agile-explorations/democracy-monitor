import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { computeMissReason } from '@/lib/services/event-validation-checks';
import type { MissReason } from '@/lib/services/event-validation-checks';
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

export interface MissedEvent {
  event: KnownEvent;
  missReason: MissReason;
}

export interface BacktestResult {
  period: string;
  category: string;
  weeklyScores: Array<{ weekOf: string } & WeekData>;
  peakWeek: string;
  peakScore: number;
  knownEvents: KnownEvent[];
  detectedEvents: KnownEvent[];
  /** Events detected in the following week (1-week latency window) */
  latencyDetectedEvents: KnownEvent[];
  missedEvents: MissedEvent[];
  falseAlarms: number;
  detectionRate: number;
  /** Elevated+ non-event weeks / total weeks — measures persistent baseline mismatch */
  baselineNoise: number;
  /** Event-elevated weeks / all elevated weeks — 1.0 = all elevation is signal */
  signalPrecision: number;
  /** Total Elevated+ weeks */
  totalElevatedWeeks: number;
  /** Elevated+ weeks that correspond to known events */
  eventElevatedWeeks: number;
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

/** Compute the Monday 7 days after a given Monday. */
function nextWeekMonday(monday: string): string {
  const d = new Date(monday + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  return toDateString(d);
}

function evaluateCategoryBacktest(
  catData: Map<string, WeekData> | undefined,
  catEvents: KnownEvent[],
  weeklyScores: Array<{ weekOf: string } & WeekData>,
): {
  peakWeek: string;
  peakScore: number;
  detectedEvents: KnownEvent[];
  latencyDetectedEvents: KnownEvent[];
  missedEvents: MissedEvent[];
  falseAlarms: number;
  detectionRate: number;
  baselineNoise: number;
  signalPrecision: number;
  totalElevatedWeeks: number;
  eventElevatedWeeks: number;
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
  const latencyDetected: KnownEvent[] = [];
  const missed: MissedEvent[] = [];
  // Track event weeks and latency weeks for false alarm / precision calculations
  const eventWeeks = new Set<string>();

  for (const event of catEvents) {
    const monday = getWeekMonday(event.date);
    eventWeeks.add(monday);
    const weekData = catData?.get(monday);
    const isDetected =
      weekData != null && convergenceStatusAtLeast(weekData.status, event.expectedMinStatus);

    if (isDetected) {
      detected.push(event);
      continue;
    }

    // 1-week latency window: check the following week
    const followingMonday = nextWeekMonday(monday);
    const followingData = catData?.get(followingMonday);
    const isLatencyDetected =
      followingData != null &&
      convergenceStatusAtLeast(followingData.status, event.expectedMinStatus);

    if (isLatencyDetected) {
      latencyDetected.push(event);
      eventWeeks.add(followingMonday);
      continue;
    }

    const dataForReason = weekData
      ? { status: weekData.status as ConvergenceStatus | null, aiScore: weekData.aiScore }
      : null;
    const reason = computeMissReason(event, dataForReason, false) ?? 'scoring_miss';
    missed.push({ event, missReason: reason });
  }

  let falseAlarms = 0;
  let totalElevatedWeeks = 0;
  let eventElevatedWeeks = 0;
  for (const ws of weeklyScores) {
    const isElevated = convergenceStatusAtLeast(ws.status, 'Elevated');
    if (isElevated) {
      totalElevatedWeeks++;
      if (eventWeeks.has(ws.weekOf)) {
        eventElevatedWeeks++;
      }
    }
    if (convergenceStatusAtLeast(ws.status, 'Divergent') && !eventWeeks.has(ws.weekOf)) {
      falseAlarms++;
    }
  }

  // Detection rate includes both exact-week and latency detections
  const totalDetected = detected.length + latencyDetected.length;
  const detectionRate = catEvents.length > 0 ? totalDetected / catEvents.length : 0;
  const nonEventElevated = totalElevatedWeeks - eventElevatedWeeks;
  const baselineNoise = weeklyScores.length > 0 ? nonEventElevated / weeklyScores.length : 0;
  const signalPrecision = totalElevatedWeeks > 0 ? eventElevatedWeeks / totalElevatedWeeks : 1;

  return {
    peakWeek,
    peakScore,
    detectedEvents: detected,
    latencyDetectedEvents: latencyDetected,
    missedEvents: missed,
    falseAlarms,
    detectionRate,
    baselineNoise,
    signalPrecision,
    totalElevatedWeeks,
    eventElevatedWeeks,
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
