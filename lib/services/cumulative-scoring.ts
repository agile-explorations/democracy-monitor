import { asc, eq, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import { DECAY_HALF_LIFE_WEEKS } from '@/lib/methodology/scoring-config';

export interface CumulativeScores {
  category: string;
  asOf: string;
  runningSum: number;
  runningAverage: number;
  weekCount: number;
  highWaterMark: number;
  highWaterWeek: string;
  currentWeekScore: number;
  decayWeightedScore: number;
  decayHalfLifeWeeks: number;
}

/**
 * Pure computation: given an ordered array of weekly scores, compute all four cumulative views.
 * Exported for direct testing without DB mocks.
 */
export function computeCumulativeFromWeeks(
  category: string,
  weeks: Array<{ weekOf: string; totalSeverity: number }>,
  halfLife: number,
): CumulativeScores {
  if (weeks.length === 0) {
    return emptyCumulativeScores(category, halfLife);
  }

  let runningSum = 0;
  let highWaterMark = 0;
  let highWaterWeek = weeks[0].weekOf;
  let decayWeightedScore = 0;

  const totalWeeks = weeks.length;
  const lastWeekIdx = totalWeeks - 1;

  for (let i = 0; i < totalWeeks; i++) {
    const score = weeks[i].totalSeverity;
    runningSum += score;

    if (score > highWaterMark) {
      highWaterMark = score;
      highWaterWeek = weeks[i].weekOf;
    }

    // Decay weight: more recent weeks get higher weight
    const weeksAgo = lastWeekIdx - i;
    const decayFactor = Math.pow(0.5, weeksAgo / halfLife);
    decayWeightedScore += score * decayFactor;
  }

  return {
    category,
    asOf: weeks[lastWeekIdx].weekOf,
    runningSum,
    runningAverage: runningSum / totalWeeks,
    weekCount: totalWeeks,
    highWaterMark,
    highWaterWeek,
    currentWeekScore: weeks[lastWeekIdx].totalSeverity,
    decayWeightedScore,
    decayHalfLifeWeeks: halfLife,
  };
}

/**
 * Compute all four cumulative views for a single category.
 * Single pass over weekly aggregates ordered by week_of ASC.
 */
export async function computeCumulativeScores(
  category: string,
  options: { halfLifeWeeks?: number } = {},
): Promise<CumulativeScores> {
  const halfLife = options.halfLifeWeeks ?? DECAY_HALF_LIFE_WEEKS;

  if (!isDbAvailable()) {
    return emptyCumulativeScores(category, halfLife);
  }

  const db = getDb();

  const rows = await db
    .select({
      weekOf: weeklyAggregates.weekOf,
      totalSeverity: weeklyAggregates.totalSeverity,
    })
    .from(weeklyAggregates)
    .where(eq(weeklyAggregates.category, category))
    .orderBy(asc(weeklyAggregates.weekOf));

  return computeCumulativeFromWeeks(category, rows, halfLife);
}

/**
 * Compute cumulative scores for all categories in one query.
 */
export async function computeAllCumulativeScores(
  options: { halfLifeWeeks?: number } = {},
): Promise<Record<string, CumulativeScores>> {
  const halfLife = options.halfLifeWeeks ?? DECAY_HALF_LIFE_WEEKS;

  if (!isDbAvailable()) return {};

  const db = getDb();

  const rows = await db
    .select({
      category: weeklyAggregates.category,
      weekOf: weeklyAggregates.weekOf,
      totalSeverity: weeklyAggregates.totalSeverity,
    })
    .from(weeklyAggregates)
    .orderBy(weeklyAggregates.category, asc(weeklyAggregates.weekOf));

  // Group by category
  const grouped: Record<string, Array<{ weekOf: string; totalSeverity: number }>> = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({ weekOf: row.weekOf, totalSeverity: row.totalSeverity });
  }

  const result: Record<string, CumulativeScores> = {};

  for (const [category, weeks] of Object.entries(grouped)) {
    result[category] = computeCumulativeFromWeeks(category, weeks, halfLife);
  }

  return result;
}

function emptyCumulativeScores(category: string, halfLife: number): CumulativeScores {
  return {
    category,
    asOf: '',
    runningSum: 0,
    runningAverage: 0,
    weekCount: 0,
    highWaterMark: 0,
    highWaterWeek: '',
    currentWeekScore: 0,
    decayWeightedScore: 0,
    decayHalfLifeWeeks: halfLife,
  };
}
