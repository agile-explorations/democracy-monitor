import type { NextApiRequest, NextApiResponse } from 'next';
import {
  countKeywordsInItems,
  calculateTrends,
  detectAnomalies,
  getBaselineCounts,
  recordTrends,
} from '@/lib/services/trend-anomaly-service';
import { getDemoResponse } from '@/lib/demo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('ai/trends', req);
  if (demo) return res.status(200).json(demo);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { category, items } = req.body;

  if (!category || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Missing required fields: category, items[]' });
  }

  try {
    const currentCounts = countKeywordsInItems(items, category);
    const baselineCounts = await getBaselineCounts(category);
    const trends = calculateTrends(currentCounts, baselineCounts, category);
    const anomalies = detectAnomalies(trends);

    await recordTrends(trends);

    res.status(200).json({
      trends: trends.filter((t) => t.currentCount > 0),
      anomalies,
      totalKeywordsTracked: trends.length,
      anomalyCount: anomalies.length,
    });
  } catch (err) {
    console.error('Trend analysis error:', err);
    res.status(500).json({ error: 'Trend analysis failed' });
  }
}
