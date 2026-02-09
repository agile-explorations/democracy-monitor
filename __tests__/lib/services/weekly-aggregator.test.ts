import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDbAvailable, getDb } from '@/lib/db';
import {
  computeWeeklyAggregate,
  computeAllWeeklyAggregates,
  getWeekOfDate,
} from '@/lib/services/weekly-aggregator';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);

/** Build a fully chainable mock db for computeWeeklyAggregate */
function mockDbForCompute(
  statsRow: Record<string, unknown>,
  keywordRows: Array<{ keyword: string }> = [],
) {
  const whereResult = Promise.resolve([statsRow]);
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(whereResult),
      }),
    }),
    execute: vi.fn().mockResolvedValue({ rows: keywordRows }),
  };
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getWeekOfDate', () => {
  it('returns Monday for a Wednesday date', () => {
    expect(getWeekOfDate('2025-02-05')).toBe('2025-02-03');
  });

  it('returns Monday for a Monday date', () => {
    expect(getWeekOfDate('2025-02-03')).toBe('2025-02-03');
  });

  it('returns Monday for a Sunday date', () => {
    expect(getWeekOfDate('2025-02-09')).toBe('2025-02-03');
  });

  it('returns Monday for a Saturday date', () => {
    expect(getWeekOfDate('2025-02-08')).toBe('2025-02-03');
  });

  it('returns a Monday when called without args', () => {
    const result = getWeekOfDate();
    const d = new Date(result);
    expect(d.getUTCDay()).toBe(1);
  });
});

describe('computeWeeklyAggregate', () => {
  it('returns empty aggregate when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    const result = await computeWeeklyAggregate('courts', '2025-02-03');

    expect(result.category).toBe('courts');
    expect(result.weekOf).toBe('2025-02-03');
    expect(result.totalSeverity).toBe(0);
    expect(result.documentCount).toBe(0);
    expect(result.avgSeverityPerDoc).toBe(0);
    expect(result.captureProportion).toBe(0);
    expect(result.severityMix).toBe(0);
    expect(result.topKeywords).toEqual([]);
  });

  it('computes proportions and severity mix from raw match counts', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForCompute(
      {
        totalSeverity: 30,
        documentCount: 3,
        captureMatchCount: 5,
        driftMatchCount: 10,
        warningMatchCount: 5,
        suppressedMatchCount: 2,
      },
      [{ keyword: 'consolidate power' }, { keyword: 'executive order' }],
    );
    mockGetDb.mockReturnValue(db as never);

    const result = await computeWeeklyAggregate('courts', '2025-02-03');

    expect(result.totalSeverity).toBe(30);
    expect(result.documentCount).toBe(3);
    expect(result.avgSeverityPerDoc).toBe(10);
    // proportions: 5/20=0.25, 10/20=0.5, 5/20=0.25
    expect(result.captureProportion).toBe(0.25);
    expect(result.driftProportion).toBe(0.5);
    expect(result.warningProportion).toBe(0.25);
    // severity mix: 0.25*4 + 0.5*2 + 0.25*1 = 2.25
    expect(result.severityMix).toBe(2.25);
    expect(result.topKeywords).toEqual(['consolidate power', 'executive order']);
  });

  it('handles zero matches with zero proportions', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForCompute({
      totalSeverity: 0,
      documentCount: 2,
      captureMatchCount: 0,
      driftMatchCount: 0,
      warningMatchCount: 0,
      suppressedMatchCount: 0,
    });
    mockGetDb.mockReturnValue(db as never);

    const result = await computeWeeklyAggregate('courts', '2025-02-03');

    expect(result.captureProportion).toBe(0);
    expect(result.driftProportion).toBe(0);
    expect(result.warningProportion).toBe(0);
    expect(result.severityMix).toBe(0);
  });

  it('handles keyword extraction failure gracefully', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForCompute({
      totalSeverity: 10,
      documentCount: 1,
      captureMatchCount: 1,
      driftMatchCount: 0,
      warningMatchCount: 0,
      suppressedMatchCount: 0,
    });
    // Override execute to throw
    db.execute = vi.fn().mockRejectedValue(new Error('JSONB error'));
    mockGetDb.mockReturnValue(db as never);

    const result = await computeWeeklyAggregate('courts', '2025-02-03');

    expect(result.topKeywords).toEqual([]);
    expect(result.totalSeverity).toBe(10);
  });

  it('severity mix is maximal (4.0) when all matches are capture tier', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForCompute({
      totalSeverity: 20,
      documentCount: 2,
      captureMatchCount: 10,
      driftMatchCount: 0,
      warningMatchCount: 0,
      suppressedMatchCount: 0,
    });
    mockGetDb.mockReturnValue(db as never);

    const result = await computeWeeklyAggregate('courts', '2025-02-03');
    expect(result.severityMix).toBe(4);
  });

  it('computes avg severity per doc', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForCompute({
      totalSeverity: 15,
      documentCount: 3,
      captureMatchCount: 0,
      driftMatchCount: 0,
      warningMatchCount: 0,
      suppressedMatchCount: 0,
    });
    mockGetDb.mockReturnValue(db as never);

    const result = await computeWeeklyAggregate('courts', '2025-02-03');
    expect(result.avgSeverityPerDoc).toBe(5);
  });

  it('zero documents yield zero avg', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const db = mockDbForCompute({
      totalSeverity: 0,
      documentCount: 0,
      captureMatchCount: 0,
      driftMatchCount: 0,
      warningMatchCount: 0,
      suppressedMatchCount: 0,
    });
    mockGetDb.mockReturnValue(db as never);

    const result = await computeWeeklyAggregate('courts', '2025-02-03');
    expect(result.avgSeverityPerDoc).toBe(0);
  });
});

describe('computeAllWeeklyAggregates', () => {
  it('returns empty object when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);
    const result = await computeAllWeeklyAggregates();
    expect(result).toEqual({});
  });

  it('computes aggregates for all category+week groups', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const groups = [
      { category: 'courts', weekOf: '2025-02-03' },
      { category: 'agencies', weekOf: '2025-02-03' },
    ];

    const statsRow = {
      totalSeverity: 10,
      documentCount: 1,
      captureMatchCount: 1,
      driftMatchCount: 0,
      warningMatchCount: 0,
      suppressedMatchCount: 0,
    };

    const db = {
      // selectDistinct chain for group discovery
      selectDistinct: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(groups),
          }),
        }),
      }),
      // select chain for individual aggregate computation
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([statsRow]),
        }),
      }),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mockGetDb.mockReturnValue(db as never);

    const result = await computeAllWeeklyAggregates();

    expect(Object.keys(result)).toContain('courts');
    expect(Object.keys(result)).toContain('agencies');
    expect(result['courts']).toHaveLength(1);
    expect(result['agencies']).toHaveLength(1);
  });
});
