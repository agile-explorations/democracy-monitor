/**
 * GET /api/health/search-timings — recent search-build timings (#727), for
 * investigating a degradation alert. Bearer CRON_SECRET protected: rows
 * contain visitor query text, which must not be publicly enumerable.
 *
 * Query params: days (default 7, max 90), flagged=1 (flagged rows only),
 * limit (default 200, max 1000).
 */

import { desc, gte, and, eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/lib/db';
import { searchTimings } from '@/lib/db/schema';
import { requireDb, requireMethod, safeEqual } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  const secret = process.env.CRON_SECRET;
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!secret || !token || !safeEqual(token, secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!requireDb(res)) return;
  const days = Math.min(parseInt((req.query.days as string) ?? '7', 10) || 7, 90);
  const limit = Math.min(parseInt((req.query.limit as string) ?? '200', 10) || 200, 1000);
  const flaggedOnly = req.query.flagged === '1';
  const since = new Date(Date.now() - days * 86400 * 1000);

  const where = flaggedOnly
    ? and(gte(searchTimings.measuredAt, since), eq(searchTimings.flagged, true))
    : gte(searchTimings.measuredAt, since);
  const rows = await getDb()
    .select()
    .from(searchTimings)
    .where(where)
    .orderBy(desc(searchTimings.measuredAt))
    .limit(limit);
  res.status(200).json({ days, flaggedOnly, count: rows.length, rows });
}
