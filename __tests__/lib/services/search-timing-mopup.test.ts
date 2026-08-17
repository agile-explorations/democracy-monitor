import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cacheGet, cacheSet } from '@/lib/cache';
import { prewarmSearchIndexes } from '@/lib/cron/prewarm-indexes';
import { recordSearchTiming } from '@/lib/services/search-timing-log';

vi.mock('@/lib/cache', () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
vi.mock('@/lib/cron/prewarm-indexes', () => ({ prewarmSearchIndexes: vi.fn() }));
vi.mock('@/lib/services/ops-alert-service', () => ({ sendOpsAlert: vi.fn() }));
vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn(() => true),
  getDb: vi.fn(() => ({
    insert: () => ({ values: () => Promise.resolve() }),
    execute: () => Promise.resolve({ rows: [{ n: 0 }] }),
  })),
}));

// Stateful fake cache: cooldown behavior, not call counting.
const store = new Map<string, unknown>();
vi.mocked(cacheGet).mockImplementation(async (key: string) => store.get(key) ?? null);
vi.mocked(cacheSet).mockImplementation(async (key: string, value: unknown) => {
  store.set(key, value);
});

const flaggedBuild = {
  query: 'q',
  queryHash: 'h',
  params: {},
  served: 'build' as const,
  embedMs: 500,
  expansionMs: 1000,
  retrieveWallMs: 40_000, // trips the 15s retrieval threshold
  totalMs: 42_000,
};

beforeEach(() => {
  store.clear();
  vi.mocked(prewarmSearchIndexes).mockClear();
});

async function flushMicrotasks() {
  await new Promise((r) => setTimeout(r, 0));
}

describe('prewarm mop-up (#729)', () => {
  it('fires after a flagged retrieval-phase build, once per cooldown window', async () => {
    await recordSearchTiming(flaggedBuild);
    await flushMicrotasks();
    expect(prewarmSearchIndexes).toHaveBeenCalledTimes(1);

    await recordSearchTiming(flaggedBuild); // cooldown holds
    await flushMicrotasks();
    expect(prewarmSearchIndexes).toHaveBeenCalledTimes(1);
  });

  it('does not fire for an embed-only trip (no eviction implied)', async () => {
    await recordSearchTiming({
      ...flaggedBuild,
      embedMs: 9000,
      retrieveWallMs: 1000,
      totalMs: 11_000,
    });
    await flushMicrotasks();
    expect(prewarmSearchIndexes).toHaveBeenCalledTimes(0);
  });
});
