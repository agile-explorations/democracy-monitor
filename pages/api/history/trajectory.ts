import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { getWeeklyTrajectory } from '@/lib/services/snapshot-store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;

  try {
    const trajectory = await getWeeklyTrajectory({ from, to });
    return res.status(200).json(trajectory);
  } catch (err) {
    console.error('[api/history/trajectory] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch trajectory' });
  }
}
