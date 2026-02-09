import type { NextApiRequest, NextApiResponse } from 'next';
import { getLatestSnapshot, getLatestSnapshots } from '@/lib/services/snapshot-store';
import { requireMethod, requireDb, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

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
    return res.status(500).json({ error: formatError(err) });
  }
}
