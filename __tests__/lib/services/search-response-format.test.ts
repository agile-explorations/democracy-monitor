import { describe, expect, it } from 'vitest';
import {
  buildDocsOnlyPayload,
  emptyResearchResponse,
  formatDocList,
  formatResearchResponse,
  hashDocsKey,
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
    const res = formatResearchResponse(withStats, [doc()], false, [
      { phrase: 'Schedule F', matches: 42 },
    ]);
    expect((res.corpusStats as { totalMatching: number }).totalMatching).toBe(42);
    expect(res.alsoSearched).toEqual(['Schedule F']);
    expect(res.searchedTerms).toEqual([{ phrase: 'Schedule F', matches: 42 }]);
  });
});

describe('hashDocsKey', () => {
  it('is stable for identical query+params and case-insensitive on the query', () => {
    expect(hashDocsKey('Schedule F', { dateFrom: '2025-01-20' })).toBe(
      hashDocsKey('  schedule f ', { dateFrom: '2025-01-20' }),
    );
  });

  it('varies with each retrieval-affecting parameter', () => {
    const base = hashDocsKey('q', {});
    expect(hashDocsKey('q', { dateFrom: '2025-01-20' })).not.toBe(base);
    expect(hashDocsKey('q', { dateTo: '2026-01-01' })).not.toBe(base);
    expect(hashDocsKey('q', { tier: 'discussion' })).not.toBe(base);
    expect(hashDocsKey('q', { eras: 'trump_t1,trump_t2' })).not.toBe(base);
  });
});

describe('buildDocsOnlyPayload', () => {
  it('omits optional sections when absent', () => {
    const payload = buildDocsOnlyPayload([doc()], 0.5, null, null, []);
    expect(payload).not.toHaveProperty('strata');
    expect(payload).not.toHaveProperty('inferredDateFrom');
    expect(payload).not.toHaveProperty('alsoSearched');
    expect((payload.documents as unknown[]).length).toBe(1);
  });

  it('includes strata, inferred floor, and chips when present', () => {
    const strata = [{ key: 'trump_t1', label: 'Trump 1', from: '2017-01-20', docCount: 5 }];
    const payload = buildDocsOnlyPayload([doc()], 0.5, strata, '2025-01-20', [
      { phrase: 'Schedule F', matches: 42 },
    ]);
    expect(payload.strata).toEqual(strata);
    expect(payload.inferredDateFrom).toBe('2025-01-20');
    expect(payload.alsoSearched).toEqual(['Schedule F']);
    expect(payload.searchedTerms).toEqual([{ phrase: 'Schedule F', matches: 42 }]);
  });
});

describe('docsOnly build stamp (#803)', () => {
  it('stamps every payload with builtAt so a refresh poll can tell fresh from stale', async () => {
    const { buildDocsOnlyPayload } = await import('@/lib/services/search-response-format');
    const before = Date.now();
    const payload = buildDocsOnlyPayload([], 0, null, null, []);
    expect(typeof payload.builtAt).toBe('string');
    expect(Date.parse(payload.builtAt as string)).toBeGreaterThanOrEqual(before - 1000);
    expect(payload).toHaveProperty('builtBy');
  });
});

describe('contributingAliases (#806)', () => {
  it('keeps only searched aliases that surfaced a pool document, case-insensitively', async () => {
    const { contributingAliases, buildDocsOnlyPayload } =
      await import('@/lib/services/search-response-format');
    const docs = [
      { id: 1, matchedAlias: 'Schedule F' },
      { id: 2, matchedAlias: 'executive order 13957' },
      { id: 3 },
    ] as never[];
    const terms = [
      { phrase: 'Schedule F', matches: 69 },
      { phrase: 'Executive Order 13957', matches: 22 },
      { phrase: 'One Big Beautiful Bill Act', matches: 460 },
    ];
    expect(contributingAliases(docs, terms)).toEqual(['Schedule F', 'Executive Order 13957']);
    const payload = buildDocsOnlyPayload(docs, 0.5, null, null, terms);
    expect(payload.alsoSearched).toHaveLength(3);
    expect(payload.contributingAliases).toEqual(['Schedule F', 'Executive Order 13957']);
  });
});
