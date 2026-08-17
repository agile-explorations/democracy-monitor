import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cacheGet, cacheSet } from '@/lib/cache';
import { dataWeekStamp, hashArmParams, runCachedArm, SLOW_ARM_MS } from '@/lib/services/arm-cache';

vi.mock('@/lib/cache', () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: vi.fn() }));

// Stateful fake cache: tests assert cache BEHAVIOR (what a later read sees),
// not call counts.
const store = new Map<string, unknown>();
vi.mocked(cacheGet).mockImplementation(async (key: string) => store.get(key) ?? null);
vi.mocked(cacheSet).mockImplementation(async (key: string, value: unknown) => {
  store.set(key, value);
});

function mockDb(rows: unknown[]) {
  const execute = vi.fn(async () => ({ rows }));
  const insert = vi.fn(() => ({
    values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
  }));
  return {
    execute,
    insert,
    transaction: (fn: (tx: { execute: typeof execute }) => unknown) => fn({ execute }),
  } as never;
}

const ARM = {
  kind: 'research' as const,
  phrase: 'state emergency management',
  paramsHash: 'abc123',
  params: { dateFrom: null, dateTo: null, tier: null },
  query: {} as never,
};

beforeEach(() => store.clear());

describe('dataWeekStamp', () => {
  it('returns the Monday of the current UTC week', () => {
    expect(dataWeekStamp(new Date('2026-08-19T15:00:00Z'))).toBe('2026-08-17'); // Wed → Mon
    expect(dataWeekStamp(new Date('2026-08-17T00:00:00Z'))).toBe('2026-08-17'); // Mon → same
    expect(dataWeekStamp(new Date('2026-08-23T23:59:00Z'))).toBe('2026-08-17'); // Sun → prior Mon
  });
});

describe('hashArmParams', () => {
  it('is order-insensitive and value-sensitive', () => {
    expect(hashArmParams({ a: '1', b: '2' })).toBe(hashArmParams({ b: '2', a: '1' }));
    expect(hashArmParams({ a: '1' })).not.toBe(hashArmParams({ a: '2' }));
  });
});

describe('runCachedArm', () => {
  it('a second run (any wording of the topic) serves the first run’s rows', async () => {
    const first = await runCachedArm(mockDb([{ id: 42 }]), ARM);
    expect(first).toEqual([{ id: 42 }]);
    // Different db rows would surface if the query re-ran — it must not.
    const second = await runCachedArm(mockDb([{ id: 99 }]), ARM);
    expect(second).toEqual([{ id: 42 }]);
  });

  it('runs the query under the safety ceiling on a miss', async () => {
    const db = mockDb([{ id: 42 }]);
    await runCachedArm(db, ARM);
    const executed = (db as { execute: ReturnType<typeof vi.fn> }).execute.mock.calls.map((c) =>
      JSON.stringify(c[0]),
    );
    expect(executed.some((q) => q.includes('statement_timeout'))).toBe(true);
  });

  it('caches nothing on failure — the next run retries and can succeed', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('statement timeout'));
    const failing = {
      execute,
      transaction: (fn: (tx: { execute: typeof execute }) => unknown) => fn({ execute }),
    } as never;
    await expect(runCachedArm(failing, ARM)).rejects.toThrow();
    const retry = await runCachedArm(mockDb([{ id: 7 }]), ARM);
    expect(retry).toEqual([{ id: 7 }]); // fresh execution, not a cached failure
  });

  it('forceRefresh (replay) replaces a stale cached result', async () => {
    await runCachedArm(mockDb([{ id: 1 }]), ARM); // stale week entry
    const refreshed = await runCachedArm(mockDb([{ id: 2 }]), ARM, true);
    expect(refreshed).toEqual([{ id: 2 }]);
    const after = await runCachedArm(mockDb([{ id: 3 }]), ARM);
    expect(after).toEqual([{ id: 2 }]); // the refresh is what the cache now serves
  });

  it('exposes the slow threshold for the ledger', () => {
    expect(SLOW_ARM_MS).toBeGreaterThan(0);
  });
});
