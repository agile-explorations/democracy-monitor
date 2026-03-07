import { and, asc, gte, lte, sql } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import type { ConvergenceSynthesis } from '@/lib/types/structural';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

interface TrajectoryPoint {
  week: string;
  status: string;
  reason: string;
  matchCount: number;
}

/**
 * Build weekly trajectory per category from weekly_aggregates convergence data.
 * Returns the same shape as the legacy assessments-based trajectory for UI compatibility.
 */
async function getWeeklyTrajectory(options?: {
  from?: string;
  to?: string;
}): Promise<Record<string, TrajectoryPoint[]>> {
  const db = getDb();
  const conditions = [sql`${weeklyAggregates.convergenceDetail} IS NOT NULL`];
  if (options?.from) conditions.push(gte(weeklyAggregates.weekOf, options.from));
  if (options?.to) conditions.push(lte(weeklyAggregates.weekOf, options.to));

  const rows = await db
    .select({
      category: weeklyAggregates.category,
      weekOf: weeklyAggregates.weekOf,
      convergenceDetail: weeklyAggregates.convergenceDetail,
    })
    .from(weeklyAggregates)
    .where(and(...conditions))
    .orderBy(weeklyAggregates.category, asc(weeklyAggregates.weekOf));

  const result: Record<string, TrajectoryPoint[]> = {};
  for (const row of rows) {
    const cat = row.category;
    if (!result[cat]) result[cat] = [];
    const detail = row.convergenceDetail as ConvergenceSynthesis | null;
    result[cat].push({
      week: row.weekOf,
      status: detail?.status ?? 'Stable',
      reason: detail?.pattern ?? '',
      matchCount: detail?.layersElevated ?? 0,
    });
  }
  return result;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  try {
    const trajectory = await getWeeklyTrajectory({ from, to });
    return res.status(200).json(trajectory);
  } catch (err) {
    console.error('[api/history/trajectory] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch trajectory' });
  }
}
