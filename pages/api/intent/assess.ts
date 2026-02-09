import type { NextApiRequest, NextApiResponse } from 'next';
import { getAvailableProviders } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { INTENT_ASSESS_CACHE_TTL_S } from '@/lib/data/cache-config';
import { isDbAvailable } from '@/lib/db';
import { enhancedIntentAssessment } from '@/lib/services/ai-intent-service';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { storeDocuments } from '@/lib/services/document-store';
import {
  fetchAllRhetoricSources,
  statementsToContentItems,
} from '@/lib/services/intent-data-service';
import { scoreStatements } from '@/lib/services/intent-service';
import { getLatestIntentSnapshot } from '@/lib/services/intent-snapshot-store';
import { formatError } from '@/lib/utils/api-helpers';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. Check DB for a stored snapshot first
    if (isDbAvailable()) {
      try {
        const snapshot = await getLatestIntentSnapshot();
        if (snapshot) {
          res.setHeader('Cache-Control', 'public, s-maxage=300');
          return res.status(200).json(snapshot);
        }
      } catch {
        // DB read failed — fall through to live fetch
      }
    }

    // 2. Check in-memory/Redis cache
    const cacheKey = 'intent:assessment';
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    // 3. Live fetch + assessment
    const allStatements = await fetchAllRhetoricSources();

    // Fire-and-forget: store documents and embed for RAG pipeline
    const contentItems = statementsToContentItems(allStatements);
    storeDocuments(contentItems, 'intent')
      .then(() => embedUnprocessedDocuments(20))
      .catch((err) => console.error('RAG pipeline failed for intent:', err));

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

    const assessment =
      getAvailableProviders().length > 0
        ? await enhancedIntentAssessment(allStatements)
        : scoreStatements(allStatements);

    await cacheSet(cacheKey, assessment, INTENT_ASSESS_CACHE_TTL_S);

    res.status(200).json(assessment);
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
