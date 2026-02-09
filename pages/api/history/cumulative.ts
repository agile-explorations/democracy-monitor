import type { NextApiRequest, NextApiResponse } from 'next';
import { computeAllCumulativeScores } from '@/lib/services/cumulative-scoring';
import { requireMethod, requireDb } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const halfLifeWeeks = req.query.halfLifeWeeks
    ? parseInt(req.query.halfLifeWeeks as string, 10)
    : undefined;

  try {
    const scores = await computeAllCumulativeScores({ halfLifeWeeks });
    return res.status(200).json(scores);
  } catch (err) {
    console.error('[api/history/cumulative] Error:', err);
    return res.status(500).json({ error: 'Failed to compute cumulative scores' });
  }
}
