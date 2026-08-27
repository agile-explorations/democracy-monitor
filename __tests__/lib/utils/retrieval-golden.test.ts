import { describe, expect, it } from 'vitest';
import { diffShapes } from '@/lib/utils/retrieval-golden';

const base = {
  id: 'q1',
  q: 'question',
  documents: [1, 2, 3],
  candidates: [
    { id: 1, matchedAlias: null, era: 'trump_t1' },
    { id: 2, matchedAlias: 'schedule f', era: 'trump_t1' },
    { id: 3, matchedAlias: null, era: 'trump_t2' },
  ],
  validated: [{ window: 'trump_t1', phrases: ['schedule f'] }],
  alsoSearched: ['schedule f'],
};

describe('diffShapes (#782 WO-5 golden guard)', () => {
  it('treats cross-era concatenation order as identical, preserving intra-era order', () => {
    const reordered = {
      ...base,
      candidates: [base.candidates[2], base.candidates[0], base.candidates[1]],
    };
    expect(diffShapes(base, reordered)).toEqual({ drift: [], noise: [] });
    const intraEraSwap = {
      ...base,
      candidates: [base.candidates[1], base.candidates[0], base.candidates[2]],
    };
    expect(diffShapes(base, intraEraSwap).drift).toEqual(['candidatesPreRerank (ids/provenance)']);
  });

  it('flags a provenance change or a validated-term change as drift', () => {
    const provenance = {
      ...base,
      candidates: base.candidates.map((c) => (c.id === 2 ? { ...c, matchedAlias: 'opm' } : c)),
    };
    expect(diffShapes(base, provenance).drift).toEqual(['candidatesPreRerank (ids/provenance)']);
    expect(diffShapes(base, { ...base, alsoSearched: [] }).drift).toEqual([
      'alsoSearched (validated terms)',
    ]);
  });

  it('reports reranker order and the trace narrowing draw as noise, not drift', () => {
    const noisy = {
      ...base,
      documents: [3, 2, 1],
      validated: [{ window: 'trump_t1', phrases: ['schedule f', 'excepted service'] }],
    };
    expect(diffShapes(base, noisy)).toEqual({
      drift: [],
      noise: ['documents (reranker order)', 'trace validated (narrowing draw)'],
    });
  });
});
