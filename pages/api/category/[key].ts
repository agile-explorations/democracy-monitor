import { and, eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { baselines } from '@/lib/db/schema';
import { PRIMARY_BASELINE_ID } from '@/lib/methodology/scoring-config';
import { getLatestSnapshot } from '@/lib/services/snapshot-store';
import { requireMethod } from '@/lib/utils/api-helpers';

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
    });
  }

  try {
    const db = getDb();
    const [assessment, baselineRow] = await Promise.all([
      getLatestSnapshot(key),
      db
        .select({
          avg: baselines.avgWeeklySeverity,
          stddev: baselines.stddevWeeklySeverity,
        })
        .from(baselines)
        .where(and(eq(baselines.baselineId, PRIMARY_BASELINE_ID), eq(baselines.category, key)))
        .then((rows) => rows[0] ?? null),
    ]);

    return res.status(200).json({
      category: key,
      title: category.title,
      assessment,
      baseline: baselineRow ?? { avg: 0, stddev: 0 },
    });
  } catch (err) {
    console.error(`[api/category/${key}] Error:`, err);
    return res.status(500).json({ error: 'Failed to fetch category detail' });
  }
}
