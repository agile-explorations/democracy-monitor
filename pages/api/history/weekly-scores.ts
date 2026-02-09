import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import { requireMethod, requireDb } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const category = req.query.category as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  if (!category) {
    return res.status(400).json({ error: 'category parameter is required' });
  }

  try {
    const db = getDb();

    const conditions = [eq(weeklyAggregates.category, category)];
    if (from) conditions.push(gte(weeklyAggregates.weekOf, from));
    if (to) conditions.push(lte(weeklyAggregates.weekOf, to));

    const rows = await db
      .select()
      .from(weeklyAggregates)
      .where(and(...conditions))
      .orderBy(asc(weeklyAggregates.weekOf));

    return res.status(200).json(rows);
  } catch (err) {
    console.error('[api/history/weekly-scores] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch weekly scores' });
  }
}
