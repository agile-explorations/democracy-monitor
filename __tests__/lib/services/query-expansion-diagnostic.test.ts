import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  expandDiagnosticWithRetry,
  validateAliasesDiagnostic,
} from '@/lib/services/query-expansion-service';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));
const mocks = vi.hoisted(() => ({
  provider: { isAvailable: vi.fn(() => false), complete: vi.fn() },
}));
vi.mock('@/lib/ai/provider', () => ({
  getProvider: vi.fn(() => mocks.provider),
}));
vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => undefined),
}));

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);

/** db.execute mock: first call = window total, then one call per candidate
 *  returning the queued match count. */
function mockDbWithCounts(windowTotal: number, perCandidate: number[]) {
  const counts = [windowTotal, ...perCandidate];
  let call = 0;
  // Counts now run inside a transaction with a SET LOCAL safety ceiling
  // (#729) — the SET call must not consume a queued count.
  const execute = vi.fn(async (q: unknown) => {
    if (JSON.stringify(q)?.includes('statement_timeout')) return { rows: [] };
    return { rows: [{ n: String(counts[call++] ?? 0) }] };
  });
  const db = {
    execute,
    insert: vi.fn(() => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) })),
    transaction: (fn: (tx: { execute: typeof execute }) => unknown) => fn({ execute }),
  };
  mockGetDb.mockReturnValue(db as never);
  return db;
}

describe('validateAliasesDiagnostic (#718)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDbAvailable.mockReturnValue(true);
  });

  it('classifies boilerplate, zero-match, over-cap, and validated aliases', async () => {
    // Window 100k -> cap clamps to 1000. Candidates in order:
    // 'Schedule F' (validated, 42), 'unicorn order' (0 -> zero-matches),
    // 'immigration' (1001 -> over-cap).
    mockDbWithCounts(100000, [42, 0, 1001]);
    const d = await validateAliasesDiagnostic(
      ['Schedule F', 'congress', 'unicorn order', 'immigration'],
      {},
    );
    expect(d.matchCap).toBe(1000);
    expect(d.validated).toEqual([{ phrase: 'Schedule F', matches: 42 }]);
    expect(d.rejected).toEqual(
      expect.arrayContaining([
        { phrase: 'congress', reason: 'boilerplate' },
        { phrase: 'unicorn order', reason: 'zero-matches', matches: 0 },
        { phrase: 'immigration', reason: 'over-match-cap', matches: 1001 },
      ]),
    );
  });

  it('returns the empty diagnostic when the db is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);
    const d = await validateAliasesDiagnostic(['Schedule F'], {});
    expect(d).toEqual({ proposed: ['Schedule F'], validated: [], rejected: [], matchCap: 0 });
  });

  it('applies the small-window floor to the match cap', async () => {
    mockDbWithCounts(1000, [30]);
    const d = await validateAliasesDiagnostic(['Schedule F'], {});
    expect(d.matchCap).toBe(200);
    expect(d.validated).toEqual([{ phrase: 'Schedule F', matches: 30 }]);
  });
});

describe('expandDiagnosticWithRetry (#733)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDbAvailable.mockReturnValue(true);
    mocks.provider.isAvailable.mockReturnValue(true);
  });

  it('narrows over-cap rejects in a single retry round and merges the result', async () => {
    // Round 1: two draws (#773) proposing the same over-cap term.
    // Round 2: its narrowed variant validates.
    mocks.provider.complete
      .mockResolvedValueOnce({ content: '["Office of Management and Budget"]' })
      .mockResolvedValueOnce({ content: '["Office of Management and Budget"]' })
      .mockResolvedValueOnce({ content: '["OMB apportionment"]' });
    // Counts consumed in order: windowTotal, round-1 count, windowTotal, round-2 count.
    mockDbWithCounts(100000, [1001, 100000, 42]);
    const d = await expandDiagnosticWithRetry('who controls agency spending?', {});
    expect(mocks.provider.complete).toHaveBeenCalledTimes(3);
    expect(d.proposed).toEqual(['Office of Management and Budget', 'OMB apportionment']);
    expect(d.validated).toEqual([{ phrase: 'OMB apportionment', matches: 42 }]);
    expect(d.rejected).toEqual(
      expect.arrayContaining([
        { phrase: 'Office of Management and Budget', reason: 'over-match-cap', matches: 1001 },
      ]),
    );
  });

  it('makes no narrowing call when nothing is over-cap', async () => {
    mocks.provider.complete
      .mockResolvedValueOnce({ content: '["Schedule F"]' })
      .mockResolvedValueOnce({ content: '["Schedule F"]' });
    mockDbWithCounts(100000, [42]);
    const d = await expandDiagnosticWithRetry('schedule f reinstatement', {});
    expect(mocks.provider.complete).toHaveBeenCalledTimes(2);
    expect(d.validated).toEqual([{ phrase: 'Schedule F', matches: 42 }]);
  });

  it('keeps the round-1 result when narrowing only re-proposes seen phrases', async () => {
    mocks.provider.complete
      .mockResolvedValueOnce({ content: '["Office of Management and Budget"]' })
      .mockResolvedValueOnce({ content: '["office of management and budget"]' })
      .mockResolvedValueOnce({ content: '["office of management and budget"]' });
    mockDbWithCounts(100000, [1001]);
    const d = await expandDiagnosticWithRetry('who controls agency spending?', {});
    expect(d.validated).toEqual([]);
    expect(d.rejected).toHaveLength(1);
    expect(d.proposed).toEqual(['Office of Management and Budget']);
  });

  it('keeps the round-1 result when the narrowing proposal itself fails', async () => {
    mocks.provider.complete
      .mockResolvedValueOnce({ content: '["Office of Management and Budget"]' })
      .mockResolvedValueOnce({ content: '["Office of Management and Budget"]' })
      .mockRejectedValueOnce(new Error('provider down'));
    mockDbWithCounts(100000, [1001]);
    const d = await expandDiagnosticWithRetry('who controls agency spending?', {});
    expect(d.validated).toEqual([]);
    expect(d.rejected).toEqual([
      { phrase: 'Office of Management and Budget', reason: 'over-match-cap', matches: 1001 },
    ]);
  });
});
