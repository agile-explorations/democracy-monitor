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

export const EMPTY_INTENT_RESULT = {
  overall: 'liberal_democracy',
  confidence: 0,
  rhetoricScore: 0,
  actionScore: 0,
  gap: 0,
  policyAreas: {},
  recentStatements: [],
  assessedAt: new Date().toISOString(),
  error: 'No data sources available',
} as const;

const INTENT_CACHE_KEY = 'intent:assessment';

async function tryStoredAssessment(): Promise<Record<string, unknown> | null> {
  if (isDbAvailable()) {
    try {
      const snapshot = await getLatestIntentSnapshot();
      if (snapshot) return snapshot as unknown as Record<string, unknown>;
    } catch {
      // DB read failed — fall through
    }
  }

  return (await cacheGet<Record<string, unknown>>(INTENT_CACHE_KEY)) ?? null;
}

async function fetchLiveAssessment(): Promise<Record<string, unknown>> {
  const allStatements = await fetchAllRhetoricSources();

  // Fire-and-forget: store documents and embed for RAG pipeline
  const contentItems = statementsToContentItems(allStatements);
  storeDocuments(contentItems, 'intent')
    .then(() => embedUnprocessedDocuments(20))
    .catch((err) => console.error('RAG pipeline failed for intent:', err));

  if (allStatements.length === 0) {
    return { ...EMPTY_INTENT_RESULT, assessedAt: new Date().toISOString() };
  }

  const assessment =
    getAvailableProviders().length > 0
      ? await enhancedIntentAssessment(allStatements)
      : scoreStatements(allStatements);

  await cacheSet(INTENT_CACHE_KEY, assessment, INTENT_ASSESS_CACHE_TTL_S);

  return assessment as unknown as Record<string, unknown>;
}

export async function fetchIntentAssessment(): Promise<Record<string, unknown>> {
  const stored = await tryStoredAssessment();
  if (stored) return stored;
  return fetchLiveAssessment();
}
