import type { NextApiRequest, NextApiResponse } from 'next';
import { computeSemanticDrift } from '@/lib/services/semantic-drift-service';
import { requireMethod, requireDb } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

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
