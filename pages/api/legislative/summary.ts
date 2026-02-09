import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { getLegislativeSummary } from '@/lib/services/legislative-dashboard-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not available' });
  }

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
