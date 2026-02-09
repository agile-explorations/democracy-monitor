import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { computeSemanticDrift } from '@/lib/services/semantic-drift-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const category = req.query.category as string | undefined;
  const week = req.query.week as string | undefined;
  const baseline = req.query.baseline as string | undefined;

  if (!category || !week) {
    return res.status(400).json({ error: 'category and week parameters are required' });
  }

  try {
    const result = await computeSemanticDrift(category, week, baseline);

    if (!result) {
      return res.status(404).json({ error: 'No embedding data available for this category/week' });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[api/history/drift] Error:', err);
    return res.status(500).json({ error: 'Failed to compute semantic drift' });
  }
}
