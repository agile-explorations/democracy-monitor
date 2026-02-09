import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { statusIndex } from '@/lib/services/status-ordering';
import type { StatusLevel } from '@/lib/types';
import { toDateString } from '@/lib/utils/date-utils';
import type { KnownEvent } from './known-events';

export interface BacktestResult {
  period: string;
  category: string;
  weeklyScores: Array<{ weekOf: string; totalSeverity: number; status: string }>;
  peakWeek: string;
  peakScore: number;
  knownEvents: KnownEvent[];
  detectedEvents: KnownEvent[];
  missedEvents: KnownEvent[];
  falseAlarms: number;
  detectionRate: number;
}

/** Returns true if `actual` is at least as severe as `threshold`. */
export function statusAtLeast(actual: string, threshold: string): boolean {
  return statusIndex(actual as StatusLevel) >= statusIndex(threshold as StatusLevel);
}

/** Get the Monday (ISO week start) for a given date string. */
export function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  // Shift Sunday (0) to 7 so Monday=1 is always the start
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return toDateString(d);
}

/**
 * Run a backtest against historical data in the database.
 * Queries weeklyAggregates and assessments, then compares against known events.
 */
export async function runBacktest(
  from: string,
  to: string,
  knownEvents: KnownEvent[],
): Promise<BacktestResult[]> {
  const db = getDb();

  // Get weekly aggregates for the period
  const aggregateRows = await db.execute(sql`
    SELECT category, week_of, total_severity
    FROM weekly_aggregates
    WHERE week_of >= ${from} AND week_of <= ${to}
    ORDER BY category, week_of
  `);

  // Get assessments for the period (one per category per week)
  const assessmentRows = await db.execute(sql`
    SELECT DISTINCT ON (category, date_trunc('week', assessed_at))
      category,
      date_trunc('week', assessed_at) AS week,
      status
    FROM assessments
    WHERE assessed_at >= ${new Date(from)} AND assessed_at <= ${new Date(to)}
    ORDER BY category, date_trunc('week', assessed_at), assessed_at DESC
  `);

  // Build lookup: category -> weekOf -> { totalSeverity, status }
  const weeklyData = new Map<string, Map<string, { totalSeverity: number; status: string }>>();

  for (const row of aggregateRows.rows) {
    const r = row as Record<string, unknown>;
    const category = r.category as string;
    const weekOf = r.week_of as string;
    const totalSeverity = Number(r.total_severity);

    if (!weeklyData.has(category)) weeklyData.set(category, new Map());
    const catMap = weeklyData.get(category)!;
    if (!catMap.has(weekOf)) catMap.set(weekOf, { totalSeverity, status: 'Stable' });
    else catMap.get(weekOf)!.totalSeverity = totalSeverity;
  }

  for (const row of assessmentRows.rows) {
    const r = row as Record<string, unknown>;
    const category = r.category as string;
    const week = toDateString(new Date(r.week as string));
    const status = r.status as string;

    if (!weeklyData.has(category)) weeklyData.set(category, new Map());
    const catMap = weeklyData.get(category)!;
    if (!catMap.has(week)) catMap.set(week, { totalSeverity: 0, status });
    else catMap.get(week)!.status = status;
  }

  // Get unique categories that have known events
  const eventCategories = [...new Set(knownEvents.map((e) => e.category))];

  const results: BacktestResult[] = [];

  for (const category of eventCategories) {
    const catData = weeklyData.get(category);
    const catEvents = knownEvents.filter((e) => e.category === category);

    // Build weekly timeline
    const weeklyScores: Array<{ weekOf: string; totalSeverity: number; status: string }> = [];
    if (catData) {
      for (const [weekOf, data] of catData) {
        weeklyScores.push({ weekOf, totalSeverity: data.totalSeverity, status: data.status });
      }
      weeklyScores.sort((a, b) => a.weekOf.localeCompare(b.weekOf));
    }

    // Find peak
    let peakWeek = '';
    let peakScore = 0;
    for (const ws of weeklyScores) {
      if (ws.totalSeverity > peakScore) {
        peakScore = ws.totalSeverity;
        peakWeek = ws.weekOf;
      }
    }

    // Map known events to their weeks and check detection
    const detected: KnownEvent[] = [];
    const missed: KnownEvent[] = [];
    const eventWeeks = new Set<string>();

    for (const event of catEvents) {
      const monday = getWeekMonday(event.date);
      eventWeeks.add(monday);

      // Find the week's status
      const weekData = catData?.get(monday);
      if (weekData && statusAtLeast(weekData.status, event.expectedSeverity)) {
        detected.push(event);
      } else {
        missed.push(event);
      }
    }

    // Count false alarms: weeks with Drift or Capture but no known event
    let falseAlarms = 0;
    for (const ws of weeklyScores) {
      if (statusAtLeast(ws.status, 'Drift') && !eventWeeks.has(ws.weekOf)) {
        falseAlarms++;
      }
    }

    const detectionRate = catEvents.length > 0 ? detected.length / catEvents.length : 0;

    results.push({
      period: `${from} to ${to}`,
      category,
      weeklyScores,
      peakWeek,
      peakScore,
      knownEvents: catEvents,
      detectedEvents: detected,
      missedEvents: missed,
      falseAlarms,
      detectionRate,
    });
  }

  return results;
}
