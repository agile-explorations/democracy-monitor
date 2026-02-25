import { and, desc, eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { baselines, weeklyAggregates } from '@/lib/db/schema';
import { PRIMARY_BASELINE_ID } from '@/lib/methodology/scoring-config';
import { getLatestSnapshot } from '@/lib/services/snapshot-store';
import type { CategoryDetailLatestWeek } from '@/lib/types/category-detail';
import { requireMethod } from '@/lib/utils/api-helpers';

/** Fetch a weekly_aggregates row (latest, or for a specific weekOf). */
async function fetchWeekLayers(
  db: ReturnType<typeof getDb>,
  category: string,
  weekOf?: string,
): Promise<CategoryDetailLatestWeek | null> {
  const conditions = [eq(weeklyAggregates.category, category)];
  if (weekOf) conditions.push(eq(weeklyAggregates.weekOf, weekOf));

  const rows = await db
    .select({
      weekOf: weeklyAggregates.weekOf,
      structuralScore: weeklyAggregates.structuralScore,
      structuralDetail: weeklyAggregates.structuralDetail,
      aiScore: weeklyAggregates.aiScore,
      aiDetail: weeklyAggregates.aiDetail,
      thematicScore: weeklyAggregates.thematicScore,
      thematicDetail: weeklyAggregates.thematicDetail,
      convergenceScore: weeklyAggregates.convergenceScore,
      convergenceDetail: weeklyAggregates.convergenceDetail,
    })
    .from(weeklyAggregates)
    .where(and(...conditions))
    .orderBy(desc(weeklyAggregates.weekOf))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    weekOf: String(row.weekOf),
    structuralScore: row.structuralScore,
    structuralDetail: row.structuralDetail as CategoryDetailLatestWeek['structuralDetail'],
    aiScore: row.aiScore,
    aiDetail: row.aiDetail as CategoryDetailLatestWeek['aiDetail'],
    thematicScore: row.thematicScore,
    thematicDetail: row.thematicDetail as CategoryDetailLatestWeek['thematicDetail'],
    convergenceScore: row.convergenceScore,
    convergenceDetail: row.convergenceDetail as CategoryDetailLatestWeek['convergenceDetail'],
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  const key = req.query.key as string;
  const category = CATEGORIES.find((c) => c.key === key);
  if (!category) {
    return res.status(404).json({ error: `Unknown category: ${key}` });
  }

  // nosemgrep: opengrep.no-inline-db-guard
  if (!isDbAvailable()) {
    return res.status(200).json({
      category: key,
      title: category.title,
      assessment: null,
      baseline: { avg: 0, stddev: 0 },
      latestWeek: null,
    });
  }

  try {
    const db = getDb();
    const [assessment, baselineRow, latestWeek] = await Promise.all([
      getLatestSnapshot(key),
      db
        .select({ avg: baselines.avgWeeklySeverity, stddev: baselines.stddevWeeklySeverity })
        .from(baselines)
        .where(and(eq(baselines.baselineId, PRIMARY_BASELINE_ID), eq(baselines.category, key)))
        .then((rows) => rows[0] ?? null),
      fetchWeekLayers(db, key, req.query.weekOf as string | undefined),
    ]);

    return res.status(200).json({
      category: key,
      title: category.title,
      assessment,
      baseline: baselineRow ?? { avg: 0, stddev: 0 },
      latestWeek,
    });
  } catch (err) {
    console.error(`[api/category/${key}] Error:`, err);
    return res.status(500).json({ error: 'Failed to fetch category detail' });
  }
}
