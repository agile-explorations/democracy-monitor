import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { getLegislativeItems } from '@/lib/services/legislative-dashboard-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { from, to, type, category, limit, offset } = req.query;

  try {
    const result = await getLegislativeItems({
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
      type: typeof type === 'string' ? type : undefined,
      category: typeof category === 'string' ? category : undefined,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
      offset: typeof offset === 'string' ? parseInt(offset, 10) : undefined,
    });
    res.status(200).json(result);
  } catch (err) {
    console.error('Legislative items error:', err);
    res.status(500).json({ error: 'Failed to fetch legislative items' });
  }
}
