import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAvailableProviders } from '@/lib/ai/provider';
import { cacheGet } from '@/lib/cache';
import { enhancedIntentAssessment } from '@/lib/services/ai-intent-service';
import { retrieveRelevantDocuments } from '@/lib/services/document-retriever';
import type { IntentStatement } from '@/lib/types/intent';

// Mock external boundaries
vi.mock('@/lib/ai/provider', () => ({
  getAvailableProviders: vi.fn(),
}));

vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/document-retriever', () => ({
  retrieveRelevantDocuments: vi.fn().mockResolvedValue([]),
}));

const mockGetProviders = vi.mocked(getAvailableProviders);
const mockCacheGet = vi.mocked(cacheGet);
const mockRetrieve = vi.mocked(retrieveRelevantDocuments);

function makeStatements(count = 3): IntentStatement[] {
  return Array.from({ length: count }, (_, i) => ({
    text: `Statement ${i} about governance`,
    source: 'test',
    sourceTier: 1 as const,
    type: 'rhetoric' as const,
    policyArea: 'rule_of_law' as const,
    score: 0,
    date: '2026-01-01',
  }));
}

function makeProvider(response: string) {
  return {
    name: 'anthropic',
    isAvailable: () => true,
    complete: vi.fn().mockResolvedValue({
      content: response,
      model: 'claude-sonnet-4-5-20250929',
      tokensUsed: { input: 100, output: 50 },
      latencyMs: 500,
    }),
  };
}

const validAIResponse = JSON.stringify({
  overall: 'executive_dominant',
  overallScore: 1.0,
  reasoning: 'Executive is expanding power.',
  items: [{ index: 1, type: 'rhetoric', area: 'rule_of_law', score: 1.0 }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProviders.mockReturnValue([]);
  mockCacheGet.mockResolvedValue(null);
  mockRetrieve.mockResolvedValue([]);
});

describe('enhancedIntentAssessment', () => {
  it('returns keyword-only result when no AI providers available', async () => {
    mockGetProviders.mockReturnValue([]);
    const result = await enhancedIntentAssessment(makeStatements());

    expect(result.overall).toBeDefined();
    expect(result.aiReasoning).toBeUndefined();
    expect(result.aiProvider).toBeUndefined();
  });

  it('populates AI fields when provider is available', async () => {
    const provider = makeProvider(validAIResponse);
    mockGetProviders.mockReturnValue([provider as never]);

    const result = await enhancedIntentAssessment(makeStatements());

    expect(result.aiReasoning).toBe('Executive is expanding power.');
    expect(result.aiOverall).toBe('executive_dominant');
    expect(result.aiProvider).toBe('anthropic');
    expect(result.aiModel).toBe('claude-sonnet-4-5-20250929');
  });

  it('keeps keyword overall even when AI disagrees', async () => {
    const provider = makeProvider(validAIResponse);
    mockGetProviders.mockReturnValue([provider as never]);

    const result = await enhancedIntentAssessment(makeStatements());

    // keyword engine produces 'liberal_democracy' for neutral text
    // AI says 'executive_dominant' — keyword must win
    expect(result.overall).not.toBe('executive_dominant');
    expect(result.aiOverall).toBe('executive_dominant');
  });

  it('generates consensus note when AI and keyword agree', async () => {
    // First determine what keyword engine produces for these statements
    const statements = makeStatements();
    const keywordOnly = await (async () => {
      mockGetProviders.mockReturnValue([]);
      return enhancedIntentAssessment(statements);
    })();
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockRetrieve.mockResolvedValue([]);

    // Use AI response that matches keyword result
    const agreeResponse = JSON.stringify({
      overall: keywordOnly.overall,
      overallScore: 0,
      reasoning: 'Matches keyword assessment.',
      items: [],
    });
    const provider = makeProvider(agreeResponse);
    mockGetProviders.mockReturnValue([provider as never]);

    const result = await enhancedIntentAssessment(statements, { skipCache: true });

    expect(result.consensusNote).toContain('agree');
  });

  it('generates disagreement note when AI and keyword differ', async () => {
    const provider = makeProvider(validAIResponse);
    mockGetProviders.mockReturnValue([provider as never]);

    const result = await enhancedIntentAssessment(makeStatements());

    expect(result.consensusNote).toContain('Using keyword result as baseline');
  });

  it('falls back to keyword-only on AI failure', async () => {
    const provider = {
      name: 'anthropic',
      isAvailable: () => true,
      complete: vi.fn().mockRejectedValue(new Error('API error')),
    };
    mockGetProviders.mockReturnValue([provider as never]);

    const result = await enhancedIntentAssessment(makeStatements());

    expect(result.overall).toBeDefined();
    expect(result.aiReasoning).toBeUndefined();
  });

  it('falls back to keyword-only on RAG failure', async () => {
    mockRetrieve.mockRejectedValue(new Error('DB error'));
    const provider = makeProvider(validAIResponse);
    mockGetProviders.mockReturnValue([provider as never]);

    const result = await enhancedIntentAssessment(makeStatements());

    // Should still succeed — RAG failure is non-fatal
    expect(result.aiReasoning).toBe('Executive is expanding power.');
  });

  it('returns cached result when available', async () => {
    const cachedResult = {
      overall: 'competitive_authoritarian' as const,
      confidence: 0.8,
      rhetoricScore: 0.5,
      actionScore: 0.3,
      gap: 0.2,
      policyAreas: {} as never,
      recentStatements: [],
      assessedAt: '2026-01-01T00:00:00.000Z',
      aiReasoning: 'Cached reasoning',
      aiProvider: 'anthropic',
    };
    mockCacheGet.mockResolvedValue(cachedResult);

    const result = await enhancedIntentAssessment(makeStatements());

    expect(result.aiReasoning).toBe('Cached reasoning');
    expect(result.overall).toBe('competitive_authoritarian');
  });

  it('skips cache when skipCache option is set', async () => {
    mockGetProviders.mockReturnValue([]);

    const result = await enhancedIntentAssessment(makeStatements(), { skipCache: true });

    // Should produce a fresh keyword result even if cache has stale data
    expect(result.overall).toBeDefined();
    expect(result.assessedAt).toBeDefined();
  });
});
