import type { NextApiRequest, NextApiResponse } from 'next';
import { getWeekExplanation } from '@/lib/services/explanation-service';
import { requireMethod, requireDb, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const { category, weekOf, top } = req.query;
  if (!category || typeof category !== 'string') {
    return res.status(400).json({ error: 'Missing required query parameter: category' });
  }

  const topN = top ? parseInt(String(top), 10) || 5 : 5;

  try {
    const explanation = await getWeekExplanation(
      category,
      typeof weekOf === 'string' ? weekOf : undefined,
      topN,
    );
    if (!explanation) {
      return res.status(404).json({ error: 'No weekly aggregate found' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json(explanation);
  } catch (err) {
    console.error('[api/explain/week] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
