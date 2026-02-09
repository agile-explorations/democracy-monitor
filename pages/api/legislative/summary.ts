import type { NextApiRequest, NextApiResponse } from 'next';
import { getLegislativeSummary } from '@/lib/services/legislative-dashboard-service';
import { requireMethod, requireDb } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const { from, to, category } = req.query;

  try {
    const summary = await getLegislativeSummary({
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
      category: typeof category === 'string' ? category : undefined,
    });
    res.status(200).json(summary);
  } catch (err) {
    console.error('Legislative summary error:', err);
    res.status(500).json({ error: 'Failed to fetch legislative summary' });
  }
}
