import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, isDbAvailable } from '@/lib/db';
import { validateAliasesDiagnostic } from '@/lib/services/query-expansion-service';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));
vi.mock('@/lib/ai/provider', () => ({
  getProvider: vi.fn(() => ({ isAvailable: () => false })),
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
  const db = {
    execute: vi.fn(async () => ({ rows: [{ n: String(counts[call++] ?? 0) }] })),
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
