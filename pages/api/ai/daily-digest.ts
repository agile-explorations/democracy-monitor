import type { NextApiRequest, NextApiResponse } from 'next';
import { generateDailyDigest } from '@/lib/services/daily-digest-service';
import { getDemoResponse } from '@/lib/demo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('ai/daily-digest', req);
  if (demo) return res.status(200).json(demo);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, categoryData, anomalies } = req.body;

  if (!date || !Array.isArray(categoryData)) {
    return res.status(400).json({ error: 'Missing required fields: date, categoryData[]' });
  }

  try {
    const result = await generateDailyDigest(date, categoryData, anomalies || []);
    if (!result) {
      return res.status(200).json({ skipped: true, reason: 'No AI providers available' });
    }
    res.status(200).json(result);
  } catch (err) {
    console.error('Daily digest error:', err);
    res.status(500).json({ error: 'Digest generation failed' });
  }
}
