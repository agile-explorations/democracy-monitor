import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { getDriftDrivingDocuments, getTypicalDocuments } from '@/lib/services/narrative-queries';
import { formatError, requireDb, requireMethod, requireWeekOf } from '@/lib/utils/api-helpers';
import { computeShiftTerms } from '@/lib/utils/tfidf';

const CACHE_TTL_SECONDS = 86_400; // 24 hours — drift labels are stable once computed

interface ShiftLabels {
  fromTerms: string[];
  toTerms: string[];
}

/** Lightweight endpoint for heatmap tooltip — returns only shift labels from cache. */
async function handleLabelsOnly(
  category: string,
  weekOf: string,
  res: NextApiResponse,
): Promise<void> {
  const cacheKey = `drift-labels:${category}:${weekOf}`;
  const cached = await cacheGet<ShiftLabels>(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    res.status(200).json({ shiftLabels: cached });
    return;
  }

  // Compute and cache
  const [typical, driftDriving] = await Promise.all([
    getTypicalDocuments(category, weekOf),
    getDriftDrivingDocuments(category, weekOf),
  ]);
  const typicalTexts = typical.map((d) => d.title);
  const driftTexts = driftDriving.map((d) => d.title);
  const shiftLabels = computeShiftTerms(typicalTexts, driftTexts);

  await cacheSet(cacheKey, shiftLabels, CACHE_TTL_SECONDS);
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
  res.status(200).json({ shiftLabels });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const category = req.query.category as string | undefined;
  if (!category) {
    return res.status(400).json({ error: 'Missing required query parameter: category' });
  }
  const weekOf = requireWeekOf(req, res);
  if (!weekOf) return;

  // ?labelsOnly=true for heatmap tooltip (lightweight)
  if (req.query.labelsOnly === 'true') {
    return handleLabelsOnly(category, weekOf, res);
  }

  try {
    const [typical, driftDriving] = await Promise.all([
      getTypicalDocuments(category, weekOf),
      getDriftDrivingDocuments(category, weekOf),
    ]);

    const typicalTexts = typical.map((d) => d.title);
    const driftTexts = driftDriving.map((d) => d.title);
    const shiftLabels = computeShiftTerms(typicalTexts, driftTexts);

    // Cache for future heatmap tooltip requests
    const cacheKey = `drift-labels:${category}:${weekOf}`;
    await cacheSet(cacheKey, shiftLabels, CACHE_TTL_SECONDS);

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ typical, driftDriving, shiftLabels });
  } catch (err) {
    return res.status(500).json({ error: formatError(err) });
  }
}
