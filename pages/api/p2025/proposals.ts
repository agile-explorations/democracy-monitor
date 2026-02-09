import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { getP2025ByCategory, getP2025Summary } from '@/lib/services/p2025-dashboard-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { category } = req.query;

  try {
    if (category) {
      const proposals = await getP2025ByCategory(String(category));
      return res.status(200).json({ proposals });
    }

    // Without category filter, return summary + all proposals grouped
    const summary = await getP2025Summary();
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
