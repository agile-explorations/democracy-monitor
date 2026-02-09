import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDbAvailable, getDb } from '@/lib/db';
import {
  BASELINE_CONFIGS,
  getBaselineConfig,
  computeBaseline,
  getBaseline,
  mean,
  stddev,
} from '@/lib/services/baseline-service';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

vi.mock('@/lib/services/embedding-service', () => ({
  computeCentroid: vi.fn((embeddings: number[][]) => {
    if (embeddings.length === 0) return null;
    const dim = embeddings[0].length;
    const centroid = new Array(dim).fill(0);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) centroid[i] += emb[i];
    }
    for (let i = 0; i < dim; i++) centroid[i] /= embeddings.length;
    return centroid;
  }),
  cosineSimilarity: vi.fn((a: number[], b: number[]) => {
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d === 0 ? 0 : dot / d;
  }),
}));

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mean (pure function)', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the value for single element', () => {
    expect(mean([7])).toBe(7);
  });

  it('computes arithmetic mean', () => {
    expect(mean([10, 20, 30])).toBe(20);
  });

  it('handles negative values', () => {
    expect(mean([-10, 10])).toBe(0);
  });

  it('handles decimals', () => {
    expect(mean([1.5, 2.5])).toBe(2);
  });
});

describe('stddev (pure function)', () => {
  it('returns 0 for empty array', () => {
    expect(stddev([])).toBe(0);
  });

  it('returns 0 for single element', () => {
    expect(stddev([42])).toBe(0);
  });

  it('uses sample stddev (N-1 denominator)', () => {
    // [10, 20, 30]: mean=20, deviations=[-10,0,10], variance=(100+0+100)/2=100, stddev=10
    expect(stddev([10, 20, 30])).toBe(10);
  });

  it('returns 0 for identical values', () => {
    expect(stddev([5, 5, 5, 5])).toBe(0);
  });

  it('computes known stddev', () => {
    // [10, 20, 30]: mean=20, deviations=[-10,0,10], variance=(100+0+100)/2=100, stddev=10
    expect(stddev([10, 20, 30])).toBe(10);
    // [0, 10]: mean=5, deviations=[-5,5], variance=50/1=50, stddev≈7.07
    expect(stddev([0, 10])).toBeCloseTo(Math.sqrt(50), 10);
  });
});

describe('BASELINE_CONFIGS', () => {
  it('has three baseline configurations', () => {
    expect(BASELINE_CONFIGS).toHaveLength(3);
  });

  it('biden_2024 is the first (default) config', () => {
    expect(BASELINE_CONFIGS[0].id).toBe('biden_2024');
  });

  it('all configs have required fields', () => {
    for (const config of BASELINE_CONFIGS) {
      expect(config.id).toBeTruthy();
      expect(config.label).toBeTruthy();
      expect(config.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(config.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(config.from).getTime()).toBeLessThan(new Date(config.to).getTime());
    }
  });
});

describe('getBaselineConfig', () => {
  it('finds a config by ID', () => {
    const config = getBaselineConfig('biden_2024');
    expect(config).toBeDefined();
    expect(config!.id).toBe('biden_2024');
    expect(config!.from).toBe('2024-01-01');
  });

  it('returns undefined for unknown ID', () => {
    const config = getBaselineConfig('unknown_baseline');
    expect(config).toBeUndefined();
  });

  it('finds all configs', () => {
    expect(getBaselineConfig('biden_2024')).toBeDefined();
    expect(getBaselineConfig('biden_2021')).toBeDefined();
    expect(getBaselineConfig('obama_2013')).toBeDefined();
  });
});

describe('computeBaseline', () => {
  it('returns empty array when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);
    const result = await computeBaseline(BASELINE_CONFIGS[0]);
    expect(result).toEqual([]);
  });

  it('computes mean and stddev from weekly aggregates (no embeddings)', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const weeklyRows = [
      {
        category: 'courts',
        weekOf: '2024-01-01',
        totalSeverity: 10,
        documentCount: 5,
        severityMix: 2.0,
      },
      {
        category: 'courts',
        weekOf: '2024-01-08',
        totalSeverity: 20,
        documentCount: 8,
        severityMix: 3.0,
      },
      {
        category: 'courts',
        weekOf: '2024-01-15',
        totalSeverity: 15,
        documentCount: 6,
        severityMix: 2.5,
      },
    ];

    const selectFn = vi
      .fn()
      // First call: weekly aggregates query
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(weeklyRows),
          }),
        }),
      })
      // Second call: documents query for embeddings (empty)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

    mockGetDb.mockReturnValue({ select: selectFn } as never);

    const result = await computeBaseline(BASELINE_CONFIGS[0]);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('courts');
    expect(result[0].baselineId).toBe('biden_2024');
    expect(result[0].avgWeeklySeverity).toBe(15);
    expect(result[0].stddevWeeklySeverity).toBe(5);
    expect(result[0].avgWeeklyDocCount).toBeCloseTo(6.333, 2);
    expect(result[0].avgSeverityMix).toBe(2.5);
    expect(result[0].embeddingCentroid).toBeNull();
    expect(result[0].driftNoiseFloor).toBeNull();
  });

  it('computes embedding centroid and noise floor when embeddings exist', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const weeklyRows = [
      {
        category: 'courts',
        weekOf: '2024-01-01',
        totalSeverity: 10,
        documentCount: 2,
        severityMix: 2.0,
      },
      {
        category: 'courts',
        weekOf: '2024-01-08',
        totalSeverity: 20,
        documentCount: 2,
        severityMix: 3.0,
      },
      {
        category: 'courts',
        weekOf: '2024-01-15',
        totalSeverity: 15,
        documentCount: 2,
        severityMix: 2.5,
      },
    ];

    // Docs with embeddings and publishedAt dates
    const embeddingDocs = [
      { embedding: [1, 0, 0], publishedAt: new Date('2024-01-02') },
      { embedding: [0, 1, 0], publishedAt: new Date('2024-01-03') },
      { embedding: [1, 1, 0], publishedAt: new Date('2024-01-09') },
      { embedding: [0, 0, 1], publishedAt: new Date('2024-01-10') },
      { embedding: [1, 0, 1], publishedAt: new Date('2024-01-16') },
      { embedding: [0, 1, 1], publishedAt: new Date('2024-01-17') },
    ];

    const selectFn = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(weeklyRows),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(embeddingDocs),
        }),
      });

    mockGetDb.mockReturnValue({ select: selectFn } as never);

    const result = await computeBaseline(BASELINE_CONFIGS[0]);

    expect(result).toHaveLength(1);
    expect(result[0].embeddingCentroid).not.toBeNull();
    expect(result[0].embeddingCentroid).toHaveLength(3);
    // Overall centroid is average of all 6 vectors
    expect(result[0].driftNoiseFloor).not.toBeNull();
    expect(result[0].driftNoiseFloor!).toBeGreaterThan(0);
  });

  it('returns null noise floor with only one week of embeddings', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const weeklyRows = [
      {
        category: 'courts',
        weekOf: '2024-01-01',
        totalSeverity: 10,
        documentCount: 2,
        severityMix: 2.0,
      },
    ];

    const embeddingDocs = [
      { embedding: [1, 0, 0], publishedAt: new Date('2024-01-02') },
      { embedding: [0, 1, 0], publishedAt: new Date('2024-01-03') },
    ];

    const selectFn = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(weeklyRows),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(embeddingDocs),
        }),
      });

    mockGetDb.mockReturnValue({ select: selectFn } as never);

    const result = await computeBaseline(BASELINE_CONFIGS[0]);

    expect(result).toHaveLength(1);
    expect(result[0].embeddingCentroid).not.toBeNull();
    // Only 1 week centroid → can't compute noise floor
    expect(result[0].driftNoiseFloor).toBeNull();
  });
});

describe('getBaseline', () => {
  it('returns null when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);
    const result = await getBaseline('biden_2024', 'courts');
    expect(result).toBeNull();
  });

  it('returns null when no row found', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never);

    const result = await getBaseline('biden_2024', 'courts');
    expect(result).toBeNull();
  });

  it('converts DB row to CategoryBaseline (date → ISO string)', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                baselineId: 'biden_2024',
                category: 'courts',
                avgWeeklySeverity: 15,
                stddevWeeklySeverity: 5,
                avgWeeklyDocCount: 6,
                avgSeverityMix: 2.5,
                driftNoiseFloor: 0.05,
                embeddingCentroid: [0.1, 0.2],
                computedAt: new Date('2025-02-08T00:00:00.000Z'),
              },
            ]),
          }),
        }),
      }),
    } as never);

    const result = await getBaseline('biden_2024', 'courts');
    expect(result).not.toBeNull();
    expect(result!.computedAt).toBe('2025-02-08T00:00:00.000Z');
    expect(typeof result!.computedAt).toBe('string');
  });
});
