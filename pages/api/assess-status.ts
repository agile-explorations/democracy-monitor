import type { NextApiRequest, NextApiResponse } from 'next';
import { analyzeContent } from '@/lib/services/assessment-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { category, items } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Missing category parameter' });
    }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing or invalid items array' });
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
