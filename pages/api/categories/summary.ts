import type { NextApiRequest, NextApiResponse } from 'next';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import { getCategorySummaries } from '@/lib/services/category-summary-service';
import { requireMethod, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  // Intentionally not using requireDb — returns fallback data (200), not 503
  // nosemgrep: opengrep.no-inline-db-guard
  if (!isDbAvailable()) {
    const fallback = CATEGORIES.map((cat) => ({
      category: cat.key,
      title: cat.title,
      convergenceStatus: null,
      structuralScore: null,
      aiScore: null,
      thematicScore: null,
      structuralElevated: false,
      aiElevated: false,
      thematicElevated: false,
      baselineAvg: 0,
      baselineStdDev: 0,
      sparklineData: [],
      documentCount: 0,
      l2FlagCount: 0,
      summary: cat.description,
      computedAt: null,
    }));
    return res.status(200).json(fallback);
  }

  try {
    const weekParam = typeof req.query.week === 'string' ? req.query.week : undefined;
    const weekOf = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : undefined;
    const summaries = await getCategorySummaries(weekOf);
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json(summaries);
  } catch (err) {
    console.error('[api/categories/summary] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
