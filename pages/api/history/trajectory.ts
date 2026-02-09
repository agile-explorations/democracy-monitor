import type { NextApiRequest, NextApiResponse } from 'next';
import { getWeeklyTrajectory } from '@/lib/services/snapshot-store';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

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
