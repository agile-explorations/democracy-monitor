import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDbAvailable, getDb } from '@/lib/db';
import { getBaseline, BASELINE_CONFIGS } from '@/lib/services/baseline-service';
import { cosineSimilarity } from '@/lib/services/embedding-service';
import { computeWeekCentroid, computeSemanticDrift } from '@/lib/services/semantic-drift-service';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

vi.mock('@/lib/services/embedding-service', () => ({
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

vi.mock('@/lib/services/baseline-service', () => ({
  getBaseline: vi.fn(),
  BASELINE_CONFIGS: [
    { id: 'biden_2024', label: 'Biden 2024', from: '2024-01-01', to: '2025-01-19' },
  ],
}));

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);
const mockGetBaseline = vi.mocked(getBaseline);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeWeekCentroid', () => {
  it('returns null when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);
    const result = await computeWeekCentroid('courts', '2025-02-03');
    expect(result).toBeNull();
  });

  it('returns null when no embeddings found', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    const result = await computeWeekCentroid('courts', '2025-02-03');
    expect(result).toBeNull();
  });

  it('computes element-wise average of embedding vectors', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { embedding: [1, 2, 3] },
              { embedding: [3, 4, 5] },
              { embedding: [5, 6, 7] },
            ]),
        }),
      }),
    } as never);

    const result = await computeWeekCentroid('courts', '2025-02-03');
    expect(result).toEqual([3, 4, 5]);
  });

  it('single vector returns itself', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ embedding: [0.1, 0.2, 0.3] }]),
        }),
      }),
    } as never);

    const result = await computeWeekCentroid('courts', '2025-02-03');
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('two vectors average to midpoint', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ embedding: [1, 0, 0] }, { embedding: [0, 1, 0] }]),
        }),
      }),
    } as never);

    const result = await computeWeekCentroid('courts', '2025-02-03');
    expect(result).toEqual([0.5, 0.5, 0]);
  });
});

describe('computeSemanticDrift', () => {
  it('returns null when no week centroid available', async () => {
    mockIsDbAvailable.mockReturnValue(false);
    const result = await computeSemanticDrift('courts', '2025-02-03');
    expect(result).toBeNull();
  });

  it('returns null when baseline has no embedding centroid', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ embedding: [1, 0, 0] }]),
        }),
      }),
    } as never);
    mockGetBaseline.mockResolvedValue({
      baselineId: 'biden_2024',
      category: 'courts',
      avgWeeklySeverity: 15,
      stddevWeeklySeverity: 5,
      avgWeeklyDocCount: 6,
      avgSeverityMix: 2.5,
      driftNoiseFloor: 0.05,
      embeddingCentroid: null,
      computedAt: '2025-02-08T00:00:00.000Z',
    });

    const result = await computeSemanticDrift('courts', '2025-02-03');
    expect(result).toBeNull();
  });

  it('drift = 0 for identical vectors', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ embedding: [1, 0, 0] }]),
        }),
      }),
    } as never);
    mockGetBaseline.mockResolvedValue({
      baselineId: 'biden_2024',
      category: 'courts',
      avgWeeklySeverity: 15,
      stddevWeeklySeverity: 5,
      avgWeeklyDocCount: 6,
      avgSeverityMix: 2.5,
      driftNoiseFloor: 0.05,
      embeddingCentroid: [1, 0, 0],
      computedAt: '2025-02-08T00:00:00.000Z',
    });

    const result = await computeSemanticDrift('courts', '2025-02-03');
    expect(result).not.toBeNull();
    expect(result!.rawCosineDrift).toBeCloseTo(0);
    expect(result!.normalizedDrift).toBeCloseTo(0);
    expect(result!.interpretation).toContain('within normal range');
  });

  it('drift = 1 for orthogonal vectors', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ embedding: [1, 0, 0] }]),
        }),
      }),
    } as never);
    mockGetBaseline.mockResolvedValue({
      baselineId: 'biden_2024',
      category: 'courts',
      avgWeeklySeverity: 15,
      stddevWeeklySeverity: 5,
      avgWeeklyDocCount: 6,
      avgSeverityMix: 2.5,
      driftNoiseFloor: 0.1,
      embeddingCentroid: [0, 1, 0],
      computedAt: '2025-02-08T00:00:00.000Z',
    });

    const result = await computeSemanticDrift('courts', '2025-02-03');
    expect(result).not.toBeNull();
    expect(result!.rawCosineDrift).toBeCloseTo(1);
    expect(result!.normalizedDrift).toBeCloseTo(10);
    expect(result!.interpretation).toContain('anomalous');
  });

  it('normalizedDrift = rawDrift / noiseFloor', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    // [1, 0] and [1, 1] have cos sim = 1/sqrt(2) ≈ 0.707
    // drift = 1 - 0.707 ≈ 0.293
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ embedding: [1, 0] }]),
        }),
      }),
    } as never);
    mockGetBaseline.mockResolvedValue({
      baselineId: 'biden_2024',
      category: 'courts',
      avgWeeklySeverity: 15,
      stddevWeeklySeverity: 5,
      avgWeeklyDocCount: 6,
      avgSeverityMix: 2.5,
      driftNoiseFloor: 0.1,
      embeddingCentroid: [1, 1],
      computedAt: '2025-02-08T00:00:00.000Z',
    });

    const result = await computeSemanticDrift('courts', '2025-02-03');
    expect(result).not.toBeNull();
    const expectedDrift = 1 - Math.sqrt(2) / 2; // ≈ 0.293
    expect(result!.rawCosineDrift).toBeCloseTo(expectedDrift, 2);
    expect(result!.normalizedDrift).toBeCloseTo(expectedDrift / 0.1, 2);
  });

  it('null normalized drift when noise floor is null', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ embedding: [1, 0, 0] }]),
        }),
      }),
    } as never);
    mockGetBaseline.mockResolvedValue({
      baselineId: 'biden_2024',
      category: 'courts',
      avgWeeklySeverity: 15,
      stddevWeeklySeverity: 5,
      avgWeeklyDocCount: 6,
      avgSeverityMix: 2.5,
      driftNoiseFloor: null,
      embeddingCentroid: [0, 1, 0],
      computedAt: '2025-02-08T00:00:00.000Z',
    });

    const result = await computeSemanticDrift('courts', '2025-02-03');
    expect(result).not.toBeNull();
    expect(result!.normalizedDrift).toBeNull();
    expect(result!.interpretation).toContain('Noise floor not available');
  });

  it('defaults to biden_2024 baseline when no baselineId provided', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ embedding: [1, 0, 0] }]),
        }),
      }),
    } as never);
    mockGetBaseline.mockResolvedValue({
      baselineId: 'biden_2024',
      category: 'courts',
      avgWeeklySeverity: 15,
      stddevWeeklySeverity: 5,
      avgWeeklyDocCount: 6,
      avgSeverityMix: 2.5,
      driftNoiseFloor: 0.05,
      embeddingCentroid: [1, 0, 0],
      computedAt: '2025-02-08T00:00:00.000Z',
    });

    const result = await computeSemanticDrift('courts', '2025-02-03');

    expect(result).not.toBeNull();
    expect(result!.baselineId).toBe('biden_2024');
  });

  it('interpretation reflects elevated level (1-2x noise floor)', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    // [1, 0.1] vs [1, 0] has cos sim ≈ 0.995, drift ≈ 0.005
    // with noiseFloor 0.003, normalized ≈ 1.67 (elevated)
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ embedding: [1, 0.1] }]),
        }),
      }),
    } as never);
    mockGetBaseline.mockResolvedValue({
      baselineId: 'biden_2024',
      category: 'courts',
      avgWeeklySeverity: 15,
      stddevWeeklySeverity: 5,
      avgWeeklyDocCount: 6,
      avgSeverityMix: 2.5,
      driftNoiseFloor: 0.003,
      embeddingCentroid: [1, 0],
      computedAt: '2025-02-08T00:00:00.000Z',
    });

    const result = await computeSemanticDrift('courts', '2025-02-03');
    expect(result).not.toBeNull();
    expect(result!.normalizedDrift!).toBeGreaterThanOrEqual(1);
    expect(result!.normalizedDrift!).toBeLessThan(2);
    expect(result!.interpretation).toContain('elevated');
  });
});
