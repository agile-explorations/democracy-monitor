import type { NextApiRequest, NextApiResponse } from 'next';
import { analyzeContent } from '@/lib/services/assessment-service';
import { enhancedAssessment } from '@/lib/services/ai-assessment-service';
import { getDemoResponse } from '@/lib/demo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('assess-status', req);
  if (demo) return res.status(200).json(demo);

  try {
    const { category, items } = req.body;
    const useAI = req.query.ai === 'true';

    if (!category) {
      return res.status(400).json({ error: 'Missing category parameter' });
    }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing or invalid items array' });
    }

    if (useAI) {
      const result = await enhancedAssessment(items, category);
      return res.status(200).json(result);
    }

    const assessment = analyzeContent(items, category);

    res.status(200).json({
      category,
      ...assessment,
      assessedAt: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
