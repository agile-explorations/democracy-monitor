import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(true),
  getDb: vi.fn(),
}));

const mockReturning = vi.fn();
const mockOnConflictDoNothing = vi.fn();
const mockValues = vi.fn();
const mockInsert = vi.fn();

const mockDeleteReturning = vi.fn();
const mockDeleteWhere = vi.fn();
const mockDelete = vi.fn();

function setupMockChain() {
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
  mockOnConflictDoNothing.mockReturnValue({ returning: mockReturning });
  mockReturning.mockResolvedValue([{ lockKey: 'test' }]);

  mockDelete.mockReturnValue({ where: mockDeleteWhere });
  mockDeleteWhere.mockImplementation(() => ({
    returning: mockDeleteReturning,
    then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve),
  }));
  mockDeleteReturning.mockResolvedValue([]);
}

describe('cron-lock', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setupMockChain();

    const { getDb } = await import('@/lib/db');
    vi.mocked(getDb).mockReturnValue({ insert: mockInsert, delete: mockDelete } as never);
  });

  it('returns true when DB is unavailable (dev mode)', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(false);

    const { acquireLock } = await import('@/lib/utils/cron-lock');
    const result = await acquireLock('test');
    expect(result).toBe(true); // nosemgrep: no DB interaction when unavailable
  });

  it('acquires lock when no conflict', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);
    mockReturning.mockResolvedValue([{ lockKey: 'backfill' }]);

    const { acquireLock } = await import('@/lib/utils/cron-lock');
    const result = await acquireLock('backfill');
    expect(result).toBe(true);
  });

  it('returns false when lock is held', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);
    mockReturning.mockResolvedValue([]); // onConflictDoNothing = 0 rows

    const { acquireLock } = await import('@/lib/utils/cron-lock');
    const result = await acquireLock('backfill');
    expect(result).toBe(false);
  });

  it('clears stale locks before acquiring', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);
    mockDeleteReturning.mockResolvedValue([{ lockKey: 'stale' }]);
    mockReturning.mockResolvedValue([{ lockKey: 'backfill' }]);

    const warnings: string[] = [];
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation((...args: unknown[]) => warnings.push(String(args[0])));

    const { acquireLock } = await import('@/lib/utils/cron-lock');
    const result = await acquireLock('backfill');

    expect(result).toBe(true);
    expect(warnings.some((w) => w.includes('Cleared 1 stale lock'))).toBe(true);
    warnSpy.mockRestore();
  });

  it('releaseLock deletes the lock', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    const { releaseLock } = await import('@/lib/utils/cron-lock');
    await releaseLock('backfill');
    expect(mockDelete).toHaveBeenCalled();
  });

  it('withCronLock runs function when lock acquired', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);
    mockReturning.mockResolvedValue([{ lockKey: 'test' }]);

    const fn = vi.fn().mockResolvedValue(undefined);

    const { withCronLock } = await import('@/lib/utils/cron-lock');
    const result = await withCronLock('test', fn);
    expect(result).toBe(true);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('withCronLock skips function when lock held', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);
    mockReturning.mockResolvedValue([]); // Lock held

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = vi.fn();

    const { withCronLock } = await import('@/lib/utils/cron-lock');
    const result = await withCronLock('test', fn);
    expect(result).toBe(false);
    // nosemgrep: opengrep.no-negative-mock-assertions — fn is the user's callback, not an internal mock
    expect(fn).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('withCronLock releases lock even on error', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);
    mockReturning.mockResolvedValue([{ lockKey: 'test' }]);

    const fn = vi.fn().mockRejectedValue(new Error('boom'));

    const { withCronLock } = await import('@/lib/utils/cron-lock');
    await expect(withCronLock('test', fn)).rejects.toThrow('boom');

    // Delete called for both stale cleanup (in acquire) and release
    expect(mockDelete).toHaveBeenCalled();
  });
});
