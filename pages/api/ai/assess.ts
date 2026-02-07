import type { NextApiRequest, NextApiResponse } from 'next';
import { getDemoResponse } from '@/lib/demo';
import { enhancedAssessment } from '@/lib/services/ai-assessment-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('ai/assess', req);
  if (demo) return res.status(200).json(demo);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
