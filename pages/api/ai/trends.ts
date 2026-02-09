import type { NextApiRequest, NextApiResponse } from 'next';
import {
  countKeywordsInItems,
  calculateTrends,
  detectAnomalies,
  getBaselineCounts,
  recordTrends,
} from '@/lib/services/trend-anomaly-service';
import { requireMethod } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return;

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
