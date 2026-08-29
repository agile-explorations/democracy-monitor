import { describe, expect, it, vi } from 'vitest';
import { parseRanking, rerankByRelevance, rerankInPlace } from '@/lib/services/relevance-rerank';

const completeMock = vi.fn();
vi.mock('@/lib/ai/provider', () => ({
  getProvider: () => ({ isAvailable: () => true, complete: completeMock }),
}));

const doc = (id: number, title: string) =>
  ({ id, title, content: `${title} body`, publishedAt: '2025-01-01', sourceType: 'bill' }) as never;

describe('parseRanking (#594)', () => {
  it('parses a clean permutation', () => {
    expect(parseRanking('[3,1,2]', 3)).toEqual([3, 1, 2]);
  });
  it('extracts the array from surrounding prose or fences', () => {
    expect(parseRanking('Ranking: [2, 1] done', 2)).toEqual([2, 1]);
  });
  it('appends omitted numbers in original order', () => {
    expect(parseRanking('[4,2,3]', 4)).toEqual([4, 2, 3, 1]);
  });
  it('rejects garbage and out-of-range values', () => {
    expect(parseRanking('no array here', 3)).toBeNull();
    expect(parseRanking('[9,8,7]', 3)).toBeNull();
  });
});

describe('rerankByRelevance', () => {
  it('reorders by the model ranking and keeps the top slice', async () => {
    completeMock.mockResolvedValueOnce({
      content: '[3,1,2]',
      tokensUsed: { input: 100, output: 10 },
    });
    const docs = [doc(1, 'A'), doc(2, 'B'), doc(3, 'C')];
    const out = await rerankByRelevance('q', docs, 2);
    expect(out.map((d: { title: string }) => d.title)).toEqual(['C', 'A']);
  });

  it('falls back to vector order on model failure', async () => {
    completeMock.mockRejectedValueOnce(new Error('boom'));
    const docs = [doc(1, 'A'), doc(2, 'B'), doc(3, 'C')];
    const out = await rerankByRelevance('q', docs, 2);
    expect(out.map((d: { title: string }) => d.title)).toEqual(['A', 'B']);
  });

  it('falls back on unparseable rankings', async () => {
    completeMock.mockResolvedValueOnce({ content: 'I cannot rank these.' });
    const docs = [doc(1, 'A'), doc(2, 'B'), doc(3, 'C')];
    const out = await rerankByRelevance('q', docs, 2);
    expect(out.map((d: { title: string }) => d.title)).toEqual(['A', 'B']);
  });

  it('is a no-op when candidates already fit', async () => {
    const docs = [doc(1, 'A')];
    expect(await rerankByRelevance('q', docs, 2)).toEqual(docs);
  });
});

describe('rerankInPlace (#800)', () => {
  it('ranks the whole pool even when nothing is cut', async () => {
    completeMock.mockResolvedValueOnce({ content: '[3,1,2]', tokensUsed: { input: 1, output: 1 } });
    const docs = [doc(1, 'A'), doc(2, 'B'), doc(3, 'C')];
    const out = await rerankInPlace('q', docs);
    expect(out.map((d: { title: string }) => d.title)).toEqual(['C', 'A', 'B']);
  });
  it('keeps the original order on failure and skips the model for a single doc', async () => {
    completeMock.mockRejectedValueOnce(new Error('boom'));
    const docs = [doc(1, 'A'), doc(2, 'B')];
    expect((await rerankInPlace('q', docs)).map((d: { title: string }) => d.title)).toEqual([
      'A',
      'B',
    ]);
    const single = [doc(1, 'A')];
    expect(await rerankInPlace('q', single)).toEqual(single);
  });
});

describe('parseRanking fallback shapes (#718, 2026-08-14)', () => {
  it('accepts a bare digits-and-commas line without brackets', () => {
    expect(parseRanking('3, 1, 2', 3)).toEqual([3, 1, 2]);
    expect(parseRanking('Ranking:\n3, 1, 2\n', 3)).toEqual([3, 1, 2]);
  });

  it('accepts a truncated bracket via the bare-line shape', () => {
    expect(parseRanking('2, 1, 3,', 3)).toEqual([2, 1, 3]);
  });

  it('still rejects prose with embedded numbers', () => {
    expect(parseRanking('Rank 1: doc 3, because it is best', 3)).toBeNull();
  });
});

describe('parseRanking live failure shapes (#718 raw-head evidence)', () => {
  it('accepts a fenced top-k bracketed list, appending the rest in order', () => {
    const r = parseRanking('```json\n[3,1,9,2,4]\n```', 30);
    expect(r!.slice(0, 5)).toEqual([3, 1, 9, 2, 4]);
    expect(r).toHaveLength(30);
    expect(r![5]).toBe(5);
  });

  it('salvages a bracket truncated by the token cap', () => {
    const nums = Array.from({ length: 50 }, (_, i) => ((i * 7) % 60) + 1);
    const truncated = '```json\n[' + nums.join(', ') + ',';
    const r = parseRanking(truncated, 60);
    expect(r).toHaveLength(60);
    expect(r!.slice(0, 5)).toEqual([...new Set(nums)].slice(0, 5));
  });

  it('rejects a tiny bracketed list below the top-k floor', () => {
    expect(parseRanking('[1, 2]', 30)).toBeNull();
  });
});
