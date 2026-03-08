import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDbAvailable, getDb } from '@/lib/db';
import {
  computeProportions,
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

describe('computeProportions', () => {
  it('computes proportions from match counts', () => {
    const result = computeProportions(5, 10, 5);
    expect(result.captureProportion).toBe(0.25);
    expect(result.driftProportion).toBe(0.5);
    expect(result.warningProportion).toBe(0.25);
  });

  it('computes severity mix using tier weights (capture=4, drift=2, warning=1)', () => {
    // 0.25*4 + 0.5*2 + 0.25*1 = 1 + 1 + 0.25 = 2.25
    const result = computeProportions(5, 10, 5);
    expect(result.severityMix).toBe(2.25);
  });

  it('returns all zeros when no matches', () => {
    const result = computeProportions(0, 0, 0);
    expect(result.captureProportion).toBe(0);
    expect(result.driftProportion).toBe(0);
    expect(result.warningProportion).toBe(0);
    expect(result.severityMix).toBe(0);
  });

  it('returns max severity mix (4.0) when all capture', () => {
    const result = computeProportions(10, 0, 0);
    expect(result.captureProportion).toBe(1);
    expect(result.severityMix).toBe(4);
  });

  it('returns min severity mix (1.0) when all warning', () => {
    const result = computeProportions(0, 0, 10);
    expect(result.warningProportion).toBe(1);
    expect(result.severityMix).toBe(1);
  });

  it('returns severity mix 2.0 when all drift', () => {
    const result = computeProportions(0, 10, 0);
    expect(result.driftProportion).toBe(1);
    expect(result.severityMix).toBe(2);
  });
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

    const result = await computeWeeklyAggregate('judicialIndependence', '2025-02-03');

    expect(result.category).toBe('judicialIndependence');
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

    const result = await computeWeeklyAggregate('judicialIndependence', '2025-02-03');

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

    const result = await computeWeeklyAggregate('judicialIndependence', '2025-02-03');

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

    const result = await computeWeeklyAggregate('judicialIndependence', '2025-02-03');

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

    const result = await computeWeeklyAggregate('judicialIndependence', '2025-02-03');
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

    const result = await computeWeeklyAggregate('judicialIndependence', '2025-02-03');
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

    const result = await computeWeeklyAggregate('judicialIndependence', '2025-02-03');
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
      { category: 'judicialIndependence', weekOf: '2025-02-03' },
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

    expect(Object.keys(result)).toContain('judicialIndependence');
    expect(Object.keys(result)).toContain('agencies');
    expect(result['judicialIndependence']).toHaveLength(1);
    expect(result['agencies']).toHaveLength(1);
  });

  it('applies from/to date filters', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const db = {
      selectDistinct: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mockGetDb.mockReturnValue(db as never);

    const result = await computeAllWeeklyAggregates({ from: '2025-01-01', to: '2025-03-01' });
    expect(result).toEqual({});
    expect(db.selectDistinct).toHaveBeenCalled();
  });

  it('groups multiple weeks under same category', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const groups = [
      { category: 'agencies', weekOf: '2025-02-03' },
      { category: 'agencies', weekOf: '2025-02-10' },
    ];

    const statsRow = {
      totalSeverity: 5,
      documentCount: 1,
      captureMatchCount: 0,
      driftMatchCount: 1,
      warningMatchCount: 0,
      suppressedMatchCount: 0,
    };

    const db = {
      selectDistinct: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(groups),
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([statsRow]),
        }),
      }),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mockGetDb.mockReturnValue(db as never);

    const result = await computeAllWeeklyAggregates();
    expect(result['agencies']).toHaveLength(2);
  });
});

describe('storeWeeklyAggregate', () => {
  it('returns without action when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    const { storeWeeklyAggregate } = await import('@/lib/services/weekly-aggregator');
    await storeWeeklyAggregate({
      category: 'agencies',
      weekOf: '2025-02-03',
      totalSeverity: 0,
      documentCount: 0,
      avgSeverityPerDoc: 0,
      captureProportion: 0,
      driftProportion: 0,
      warningProportion: 0,
      severityMix: 0,
      captureMatchCount: 0,
      driftMatchCount: 0,
      warningMatchCount: 0,
      suppressedMatchCount: 0,
      topKeywords: [],
      computedAt: new Date().toISOString(),
    });

    expect(mockGetDb).toHaveBeenCalledTimes(0);
  });

  it('upserts aggregate to database when DB is available', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    const db = { insert: mockInsert };
    mockGetDb.mockReturnValue(db as never);

    const { storeWeeklyAggregate } = await import('@/lib/services/weekly-aggregator');
    await storeWeeklyAggregate({
      category: 'agencies',
      weekOf: '2025-02-03',
      totalSeverity: 10,
      documentCount: 2,
      avgSeverityPerDoc: 5,
      captureProportion: 0.5,
      driftProportion: 0.3,
      warningProportion: 0.2,
      severityMix: 2.6,
      captureMatchCount: 5,
      driftMatchCount: 3,
      warningMatchCount: 2,
      suppressedMatchCount: 1,
      topKeywords: ['test'],
      computedAt: new Date().toISOString(),
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockOnConflict).toHaveBeenCalled();
  });

  it('handles optional layer fields with null defaults', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    const db = { insert: mockInsert };
    mockGetDb.mockReturnValue(db as never);

    const { storeWeeklyAggregate } = await import('@/lib/services/weekly-aggregator');
    await storeWeeklyAggregate({
      category: 'agencies',
      weekOf: '2025-02-03',
      totalSeverity: 10,
      documentCount: 2,
      avgSeverityPerDoc: 5,
      captureProportion: 0,
      driftProportion: 0,
      warningProportion: 0,
      severityMix: 0,
      captureMatchCount: 0,
      driftMatchCount: 0,
      warningMatchCount: 0,
      suppressedMatchCount: 0,
      topKeywords: [],
      structuralScore: 0.5,
      structuralDetail: { test: true },
      thematicScore: undefined,
      aiScore: undefined,
      computedAt: new Date().toISOString(),
    });

    // Upsert was called with the aggregate including optional layer fields
    expect(mockOnConflict).toHaveBeenCalledTimes(1);
  });
});
