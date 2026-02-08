import type { NextApiRequest, NextApiResponse } from 'next';
import { runLegalAnalysis } from '@/lib/services/legal-analysis-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { category, status, evidence } = req.body;

  if (!category || !status || !Array.isArray(evidence)) {
    return res.status(400).json({ error: 'Missing required fields: category, status, evidence[]' });
  }

  try {
    const result = await runLegalAnalysis(category, status, evidence);
    if (!result) {
      return res.status(200).json({ skipped: true, reason: 'No AI providers available' });
    }
    res.status(200).json(result);
  } catch (err) {
    console.error('Legal analysis error:', err);
    res.status(500).json({ error: 'Legal analysis failed' });
  }
}
