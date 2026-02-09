import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDbAvailable, getDb } from '@/lib/db';
import { computeIntentWeekly, aggregateAllAreas } from '@/lib/services/intent-weekly-aggregator';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

vi.mock('@/lib/services/weekly-aggregator', () => ({
  getWeekOfDate: vi.fn().mockReturnValue('2025-02-03'),
}));

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);

function mockDbForQuery(statsRow: Record<string, unknown>) {
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([statsRow]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeIntentWeekly', () => {
  it('returns empty row when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    const result = await computeIntentWeekly('rule_of_law', '2025-02-03');

    expect(result.policyArea).toBe('rule_of_law');
    expect(result.weekOf).toBe('2025-02-03');
    expect(result.rhetoricScore).toBe(0);
    expect(result.actionScore).toBe(0);
    expect(result.gap).toBe(0);
    expect(result.statementCount).toBe(0);
  });

  it('computes average rhetoric and action scores from DB', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForQuery({
      rhetoricAvg: 0.75,
      actionAvg: 0.25,
      total: 10,
    });
    mockGetDb.mockReturnValue(db as never);

    const result = await computeIntentWeekly('rule_of_law', '2025-02-03');

    expect(result.rhetoricScore).toBe(0.75);
    expect(result.actionScore).toBe(0.25);
    expect(result.gap).toBe(0.5);
    expect(result.statementCount).toBe(10);
  });

  it('handles zero statements with zero scores', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForQuery({
      rhetoricAvg: 0,
      actionAvg: 0,
      total: 0,
    });
    mockGetDb.mockReturnValue(db as never);

    const result = await computeIntentWeekly('civil_liberties', '2025-02-03');

    expect(result.rhetoricScore).toBe(0);
    expect(result.actionScore).toBe(0);
    expect(result.gap).toBe(0);
    expect(result.statementCount).toBe(0);
  });

  it('rounds scores to 2 decimal places', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForQuery({
      rhetoricAvg: 0.333333,
      actionAvg: -0.666666,
      total: 5,
    });
    mockGetDb.mockReturnValue(db as never);

    const result = await computeIntentWeekly('elections', '2025-02-03');

    expect(result.rhetoricScore).toBe(0.33);
    expect(result.actionScore).toBe(-0.67);
    expect(result.gap).toBe(1);
  });
});

describe('aggregateAllAreas', () => {
  it('completes without error when DB is available', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForQuery({
      rhetoricAvg: 0.5,
      actionAvg: 0.3,
      total: 4,
    });
    mockGetDb.mockReturnValue(db as never);

    await expect(aggregateAllAreas('2025-02-03')).resolves.toBeUndefined();
  });

  it('completes without error when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    await expect(aggregateAllAreas('2025-02-03')).resolves.toBeUndefined();
  });

  it('uses getWeekOfDate as default when weekOf not provided', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    // Should not throw — uses mocked getWeekOfDate returning '2025-02-03'
    await expect(aggregateAllAreas()).resolves.toBeUndefined();
  });
});
