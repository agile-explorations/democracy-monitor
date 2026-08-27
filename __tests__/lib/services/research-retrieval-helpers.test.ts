import { describe, expect, it, vi } from 'vitest';
import { expandAndValidate } from '@/lib/services/query-expansion-service';
import { collectAlsoSearched } from '@/lib/services/research-retrieval-helpers';

vi.mock('@/lib/services/query-expansion-service', () => ({ expandAndValidate: vi.fn() }));
vi.mock('@/lib/services/relevance-rerank', () => ({
  rerankByRelevance: vi.fn(),
  rerankTierBalanced: vi.fn(),
}));

describe('collectAlsoSearched (#782 WO-5: windows in series, merge in window order)', () => {
  it('merges windows in window order with the max count', async () => {
    vi.mocked(expandAndValidate).mockImplementation(async (_q, w) => {
      if (w.dateFrom === '2017-01-20') {
        await new Promise((r) => setTimeout(r, 10));
        return [
          { phrase: 'schedule f', matches: 40 },
          { phrase: 'opm', matches: 5 },
        ];
      }
      return [
        { phrase: 'mspb', matches: 7 },
        { phrase: 'schedule f', matches: 12 },
      ];
    });
    const out = await collectAlsoSearched(
      'q',
      [
        { from: '2017-01-20', to: '2021-01-19' },
        { from: '2025-01-20', to: undefined },
      ],
      'all',
    );
    expect(out).toEqual([
      { phrase: 'schedule f', matches: 40 },
      { phrase: 'opm', matches: 5 },
      { phrase: 'mspb', matches: 7 },
    ]);
  });

  it('expands each window with its own dates and the tier ("all" = unfiltered)', async () => {
    vi.mocked(expandAndValidate).mockImplementation(async (_q, w) => [
      { phrase: `${w.dateFrom}..${w.dateTo}|${w.tier ?? 'unfiltered'}`, matches: 1 },
    ]);
    const all = await collectAlsoSearched('q', [{ from: 'a', to: 'b' }], 'all');
    expect(all.map((a) => a.phrase)).toEqual(['a..b|unfiltered']);
    const discussion = await collectAlsoSearched(
      'q',
      [
        { from: 'a', to: 'b' },
        { from: 'c', to: 'd' },
      ],
      'discussion',
    );
    expect(discussion.map((a) => a.phrase)).toEqual(['a..b|discussion', 'c..d|discussion']);
  });
});
