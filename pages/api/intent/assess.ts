import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { getDemoResponse } from '@/lib/demo';
import {
  fetchPresidentialDocuments,
  fetchWhiteHouseBriefings,
} from '@/lib/services/intent-data-service';
import { scoreStatements } from '@/lib/services/intent-service';

const CACHE_TTL_S = 1800; // 30 minutes

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('intent/assess', _req);
  if (demo) return res.status(200).json(demo);

  try {
    const cacheKey = 'intent:assessment';
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Fetch data from multiple sources
    const [presidentialDocs, whBriefings] = await Promise.all([
      fetchPresidentialDocuments(),
      fetchWhiteHouseBriefings(),
    ]);

    const allStatements = [...presidentialDocs, ...whBriefings];

    if (allStatements.length === 0) {
      return res.status(200).json({
        overall: 'liberal_democracy',
        confidence: 0,
        rhetoricScore: 0,
        actionScore: 0,
        gap: 0,
        policyAreas: {},
        recentStatements: [],
        assessedAt: new Date().toISOString(),
        error: 'No data sources available',
      });
    }

    const assessment = scoreStatements(allStatements);

    await cacheSet(cacheKey, assessment, CACHE_TTL_S);

    res.status(200).json(assessment);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
