import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { getLatestSnapshot, getLatestSnapshots } from '@/lib/services/snapshot-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { category } = req.query;

    if (category && typeof category === 'string') {
      const snapshot = await getLatestSnapshot(category);
      if (!snapshot) {
        return res.status(404).json({ error: `No snapshot found for category: ${category}` });
      }
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.status(200).json(snapshot);
    }

    const snapshots = await getLatestSnapshots();
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json(snapshots);
  } catch (err) {
    console.error('[api/snapshots/latest] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
