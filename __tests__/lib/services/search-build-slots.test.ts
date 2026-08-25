import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cacheDel, cacheGet, cacheSet } from '@/lib/cache';
import {
  claimBuildSlot,
  claimGlobalBuildSlot,
  releaseBuildSlot,
  releaseGlobalBuildSlot,
} from '@/lib/services/search-docs-response';

vi.mock('@/lib/cache', () => ({ cacheGet: vi.fn(), cacheSet: vi.fn(), cacheDel: vi.fn() }));

// Stateful fake cache — tests assert slot BEHAVIOR (claim/exhaust/release).
const store = new Map<string, unknown>();
vi.mocked(cacheGet).mockImplementation(async (key: string) => store.get(key) ?? null);
vi.mocked(cacheSet).mockImplementation(async (key: string, value: unknown) => {
  store.set(key, value);
});
vi.mocked(cacheDel).mockImplementation(async (key: string) => {
  store.delete(key);
});

beforeEach(() => store.clear());

describe('build coalescing slot (#729)', () => {
  it('the second claim for the same search loses until the first releases', async () => {
    expect(await claimBuildSlot('abc')).toBe(true);
    expect(await claimBuildSlot('abc')).toBe(false);
    releaseBuildSlot('abc');
    expect(await claimBuildSlot('abc')).toBe(true);
  });

  it('distinct searches claim independently', async () => {
    expect(await claimBuildSlot('abc')).toBe(true);
    expect(await claimBuildSlot('def')).toBe(true);
  });
});

describe('global build semaphore (#729 DOS hardening)', () => {
  it('caps concurrent builds and frees capacity on release', async () => {
    const a = await claimGlobalBuildSlot();
    const b = await claimGlobalBuildSlot();
    const c = await claimGlobalBuildSlot();
    expect([a, b, c]).toEqual([0, 1, 2]);
    expect(await claimGlobalBuildSlot()).toBeNull(); // 4th concurrent build queues

    releaseGlobalBuildSlot(b as number);
    expect(await claimGlobalBuildSlot()).toBe(1); // freed slot is reusable
  });
});

describe('never-cache-empty guard (#778/#780)', () => {
  const buildRes = () => {
    const res = { statusCode: 0, body: undefined as unknown };
    return Object.assign(res, {
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        res.body = payload;
        return res;
      },
    });
  };
  const req = { query: {} };

  it('caches a build with documents but serves-without-caching an empty one', async () => {
    const { respondDocsOnlyBuild } = await import('@/lib/services/search-docs-response');
    const mkBuild = (docs: unknown[]) => ({
      queryHash: 'abcd1234abcd1234',
      debug: false,
      docsCacheKey: 'search:rdocs:test:v3',
      docsHash: 'testhash',
      embedMs: 1,
      avgSimilarity: 0.5,
      retrieval: {
        docs,
        strata: null,
        inferredFrom: null,
        alsoSearched: [],
        timings: { expansionMs: 1, retrieveWallMs: 1, windows: [], totalMs: 2 },
      },
    });
    store.clear();
    const okRes = buildRes();
    await respondDocsOnlyBuild(
      req as never,
      okRes as never,
      'a question',
      mkBuild([{ id: 1 }]) as never,
    );
    expect(okRes.statusCode).toBe(200);
    expect(store.has('search:rdocs:test:v3')).toBe(true);

    store.clear();
    const emptyRes = buildRes();
    await respondDocsOnlyBuild(req as never, emptyRes as never, 'a question', mkBuild([]) as never);
    expect(emptyRes.statusCode).toBe(200);
    expect(store.has('search:rdocs:test:v3')).toBe(false);
  });
});
