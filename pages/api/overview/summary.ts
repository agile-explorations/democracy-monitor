import type { NextApiRequest, NextApiResponse } from 'next';
import { getOverviewSummary } from '@/lib/services/overview-service';
import { requireMethod, requireDb, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    const weeks = req.query.weeks ? Number(req.query.weeks) : undefined;
    const summary = await getOverviewSummary(weeks);
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json(summary);
  } catch (err) {
    console.error('[api/overview/summary] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
