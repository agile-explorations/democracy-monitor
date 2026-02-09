import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { intentStatements, intentWeekly } from '@/lib/db/schema';
import { getWeekOfDate } from '@/lib/services/weekly-aggregator';
import { POLICY_AREAS } from '@/lib/types/intent';
import { toDateString } from '@/lib/utils/date-utils';

export interface IntentWeeklyRow {
  policyArea: string;
  weekOf: string;
  rhetoricScore: number;
  actionScore: number;
  gap: number;
  statementCount: number;
}

/**
 * Compute the weekly intent aggregate for a single policy area and week.
 * Queries intentStatements for the given week, averages rhetoric and action scores.
 */
export async function computeIntentWeekly(
  policyArea: string,
  weekOf: string,
): Promise<IntentWeeklyRow> {
  if (!isDbAvailable()) {
    return emptyRow(policyArea, weekOf);
  }

  const db = getDb();

  // weekOf is Monday; compute end of week (Sunday)
  const weekEnd = new Date(weekOf);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = toDateString(weekEnd);

  const [stats] = await db
    .select({
      rhetoricAvg: sql<number>`coalesce(avg(case when ${intentStatements.type} = 'rhetoric' then ${intentStatements.score} end), 0)`,
      actionAvg: sql<number>`coalesce(avg(case when ${intentStatements.type} = 'action' then ${intentStatements.score} end), 0)`,
      total: sql<number>`count(*)::int`,
    })
    .from(intentStatements)
    .where(
      and(
        eq(intentStatements.policyArea, policyArea),
        gte(intentStatements.date, weekOf),
        lte(intentStatements.date, weekEndStr),
      ),
    );

  const rhetoricScore = Math.round(Number(stats.rhetoricAvg) * 100) / 100;
  const actionScore = Math.round(Number(stats.actionAvg) * 100) / 100;
  const gap = Math.round(Math.abs(rhetoricScore - actionScore) * 100) / 100;
  const statementCount = Number(stats.total);

  return {
    policyArea,
    weekOf,
    rhetoricScore,
    actionScore,
    gap,
    statementCount,
  };
}

/**
 * Upsert a weekly intent row into the database.
 */
export async function storeIntentWeekly(row: IntentWeeklyRow): Promise<void> {
  if (!isDbAvailable()) return;

  const db = getDb();

  await db
    .insert(intentWeekly)
    .values({
      policyArea: row.policyArea,
      weekOf: row.weekOf,
      rhetoricScore: row.rhetoricScore,
      actionScore: row.actionScore,
      gap: row.gap,
      statementCount: row.statementCount,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [intentWeekly.policyArea, intentWeekly.weekOf],
      set: {
        rhetoricScore: sql`excluded.rhetoric_score`,
        actionScore: sql`excluded.action_score`,
        gap: sql`excluded.gap`,
        statementCount: sql`excluded.statement_count`,
        computedAt: sql`excluded.computed_at`,
      },
    });
}

/**
 * Compute and store weekly intent aggregates for all 5 policy areas.
 */
export async function aggregateAllAreas(weekOf?: string): Promise<void> {
  const week = weekOf || getWeekOfDate();

  for (const area of POLICY_AREAS) {
    const row = await computeIntentWeekly(area, week);
    await storeIntentWeekly(row);
  }
}

function emptyRow(policyArea: string, weekOf: string): IntentWeeklyRow {
  return {
    policyArea,
    weekOf,
    rhetoricScore: 0,
    actionScore: 0,
    gap: 0,
    statementCount: 0,
  };
}
