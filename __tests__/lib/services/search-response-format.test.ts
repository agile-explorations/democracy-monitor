import { describe, expect, it } from 'vitest';
import {
  emptyResearchResponse,
  formatDocList,
  formatResearchResponse,
} from '@/lib/services/search-response-format';
import type { CachedResearchResult } from '@/lib/services/search-response-format';
import type { ResearchDocument } from '@/lib/services/search-service';

function doc(overrides: Partial<ResearchDocument> = {}): ResearchDocument {
  return {
    id: 1,
    title: 'Doc',
    content: 'body',
    url: 'https://example.gov/1',
    publishedAt: '2025-01-21',
    sourceType: 'executive_order',
    tier: 'action',
    sourceOrigin: 'federal_register',
    caseId: null,
    category: 'executiveActions',
    cosineSimilarity: 0.5,
    finalScore: null,
    documentClass: null,
    p2Assessment: null,
    p2ErosionType: null,
    p2Confidence: null,
    p2Summary: null,
    ...overrides,
  };
}

function cachedResult(): CachedResearchResult {
  return {
    synthesis: {
      expert: 'E',
      public: 'P',
      relatedQuestions: ['Q1'],
      expertDraft: 'ED',
      publicDraft: 'PD',
      feedback: 'F',
      draftModel: 'd',
      feedbackModel: 'f',
      finalModel: 'x',
    },
    documents: [doc()],
    queryConfidence: 0.5,
    corpusStats: null,
  };
}

describe('emptyResearchResponse', () => {
  it('includes an empty answer only in full mode', () => {
    expect(emptyResearchResponse(true)).not.toHaveProperty('answer');
    const full = emptyResearchResponse(false) as { answer: { expert: string } };
    expect(full.answer.expert).toContain('does not contain enough information');
  });
});

describe('formatDocList', () => {
  it('assigns 1-based citation indexes', () => {
    const list = formatDocList([doc({ id: 7 }), doc({ id: 9 })]);
    expect(list.map((d) => d.citationIndex)).toEqual([1, 2]);
  });

  it('includes matchSnippet and matchedAlias only when present', () => {
    const [plain, matched] = formatDocList([
      doc(),
      doc({ id: 2, matchSnippet: 'around [[hit]]', matchedAlias: 'hit', caseId: 'cl:1' }),
    ]);
    expect(plain).not.toHaveProperty('matchSnippet');
    expect(plain.caseId).toBeNull();
    expect(matched.matchSnippet).toBe('around [[hit]]');
    expect(matched.matchedAlias).toBe('hit');
    expect(matched.caseId).toBe('cl:1');
  });
});

describe('formatResearchResponse', () => {
  it('omits editorial, corpusStats, and alsoSearched by default', () => {
    const res = formatResearchResponse(cachedResult(), [doc()], false);
    expect(res).not.toHaveProperty('editorial');
    expect(res).not.toHaveProperty('corpusStats');
    expect(res).not.toHaveProperty('alsoSearched');
    expect((res.answer as { expert: string }).expert).toBe('E');
  });

  it('includes editorial drafts when requested', () => {
    const res = formatResearchResponse(cachedResult(), [doc()], true);
    expect((res.editorial as { draftModel: string }).draftModel).toBe('d');
  });

  it('includes corpusStats and alsoSearched when provided', () => {
    const withStats = { ...cachedResult(), corpusStats: { totalMatching: 42 } };
    const res = formatResearchResponse(withStats, [doc()], false, ['Schedule F']);
    expect((res.corpusStats as { totalMatching: number }).totalMatching).toBe(42);
    expect(res.alsoSearched).toEqual(['Schedule F']);
  });
});
