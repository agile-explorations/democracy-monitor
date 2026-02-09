import type { NextApiRequest, NextApiResponse } from 'next';
import { enhancedAssessment } from '@/lib/services/ai-assessment-service';
import { requireMethod, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const { category, items, providers } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Missing category parameter' });
    }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing or invalid items array' });
    }

    const result = await enhancedAssessment(items, category, {
      providers: providers || ['anthropic', 'openai'],
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
