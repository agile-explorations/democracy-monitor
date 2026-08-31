import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, isDbAvailable } from '@/lib/db';
import { CRON_RUN_STALE_MS, startCronRun } from '@/lib/services/cron-run-store';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);

/** Chainable mock that records the order of update/insert operations. */
function mockDb(ops: string[]) {
  return {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          ops.push('sweep');
          return Promise.resolve([]);
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          ops.push('insert');
          return Promise.resolve([{ id: 42 }]);
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startCronRun — stale-run self-heal (#829)', () => {
  it('sweeps dead running rows before inserting the new one', async () => {
    const ops: string[] = [];
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue(mockDb(ops) as unknown as ReturnType<typeof getDb>);
    const id = await startCronRun('snapshot');
    expect(id).toBe(42);
    expect(ops).toEqual(['sweep', 'insert']);
  });

  it('returns -1 without touching the db when no database is configured', async () => {
    const ops: string[] = [];
    mockIsDbAvailable.mockReturnValue(false);
    mockGetDb.mockReturnValue(mockDb(ops) as unknown as ReturnType<typeof getDb>);
    const id = await startCronRun('snapshot');
    expect(id).toBe(-1);
    expect(ops).toEqual([]);
  });

  it('uses a stale window long enough for the longest legitimate run', () => {
    // Snapshot runs approach an hour; the sweep must never reap a live run.
    expect(CRON_RUN_STALE_MS).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000);
  });
});
