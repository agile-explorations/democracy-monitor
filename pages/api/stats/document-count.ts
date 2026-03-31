/** GET /api/stats/document-count — total unique documents in the repository (cached 7 days). */

import { countDistinct } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { requireDb, requireMethod, sendCached } from '@/lib/utils/api-helpers';

const ONE_WEEK = 7 * 24 * 60 * 60;

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    const cached = await cacheGet<number>(CacheKeys.documentCount());
    if (cached !== null) {
      sendCached(res, { total: cached });
      return;
    }

    const db = getDb();
    const [row] = await db.select({ total: countDistinct(documents.url) }).from(documents);
    await cacheSet(CacheKeys.documentCount(), row.total, ONE_WEEK);
    sendCached(res, { total: row.total });
  } catch (err) {
    console.error('[api/stats/document-count] error:', err);
    res.status(500).json({ error: 'Failed to count documents' });
  }
}
