import type { NextApiRequest, NextApiResponse } from 'next';
import { getConfigSnapshot } from '@/lib/services/explanation-service';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const config = getConfigSnapshot();

  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  return res.status(200).json({
    ...config,
    formulaDescriptions: {
      severityScore:
        'captureWeight * log2(captureCount + 1) + driftCount * driftWeight + warningCount * warningWeight',
      finalScore: 'severityScore * classMultiplier',
      weeklyAggregate: 'sum(finalScore) across all documents in the category for the week',
      cumulativeScore: 'exponentially decayed sum with half-life of decayHalfLifeWeeks',
    },
  });
}
