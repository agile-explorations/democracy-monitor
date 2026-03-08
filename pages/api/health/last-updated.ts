import { desc } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import { requireDb, requireMethod, sendCached } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const db = getDb();
  const row = await db
    .select({ computedAt: weeklyAggregates.computedAt })
    .from(weeklyAggregates)
    .orderBy(desc(weeklyAggregates.computedAt))
    .limit(1);

  const lastUpdated = row[0]?.computedAt?.toISOString() ?? null;
  return sendCached(res, { lastUpdated });
}
