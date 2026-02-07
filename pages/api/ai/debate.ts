import type { NextApiRequest, NextApiResponse } from 'next';
import { getDemoResponse } from '@/lib/demo';
import { runDebate } from '@/lib/services/debate-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('ai/debate', req);
  if (demo) return res.status(200).json(demo);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { category, status, evidence } = req.body;

  if (!category || !status || !Array.isArray(evidence)) {
    return res.status(400).json({ error: 'Missing required fields: category, status, evidence[]' });
  }

  // Only run debates for Drift/Capture (cost control)
  if (!['Drift', 'Capture'].includes(status)) {
    return res
      .status(200)
      .json({ skipped: true, reason: 'Debates only run for Drift/Capture assessments' });
  }

  try {
    const result = await runDebate(category, status, evidence);
    if (!result) {
      return res.status(200).json({ skipped: true, reason: 'Insufficient AI providers available' });
    }
    res.status(200).json(result);
  } catch (err) {
    console.error('Debate error:', err);
    res.status(500).json({ error: 'Debate failed' });
  }
}
