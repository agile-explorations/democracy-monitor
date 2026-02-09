import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { computeAllCumulativeScores } from '@/lib/services/cumulative-scoring';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not configured' });
  }

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
