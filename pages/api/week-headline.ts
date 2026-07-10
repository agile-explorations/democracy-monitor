import type { NextApiRequest, NextApiResponse } from 'next';
import { getWeekHeadline } from '@/lib/services/week-headlines';
import { requireDb, requireMethod, formatError, sendCached } from '@/lib/utils/api-helpers';

/** One-line AI event headline for a week (#539); null when not yet computed. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const week = typeof req.query.week === 'string' ? req.query.week : null;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return res.status(400).json({ error: 'week (YYYY-MM-DD) is required' });
  }

  try {
    const headline = await getWeekHeadline(week);
    return sendCached(res, { headline });
  } catch (err) {
    console.error('[api/week-headline] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
