import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runComputeBaselineStats } from '@/lib/cron/compute-baseline-stats';

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(true),
  getDb: vi.fn().mockReturnValue({
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
  }),
}));

vi.mock('@/lib/services/baseline-service', () => ({
  computeBaseline: vi.fn().mockResolvedValue([
    {
      baselineId: 'biden_2022',
      category: 'executiveActions',
      avgWeeklySeverity: 12.5,
      stddevWeeklySeverity: 3.2,
      avgWeeklyDocCount: 45.3,
      avgSeverityMix: 0.6,
      driftNoiseFloor: 0.05,
      embeddingCentroid: null,
      cycleYear: 2,
      administration: 'biden',
      calendarYear: 2022,
      computedAt: '2026-01-01T00:00:00Z',
    },
  ]),
  storeBaseline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/weekly-aggregator', () => ({
  computeWeeklyAggregate: vi.fn().mockResolvedValue({
    category: 'executiveActions',
    weekOf: '2022-01-24',
    totalSeverity: 12,
    documentCount: 10,
    avgSeverityPerDoc: 1.2,
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
  }),
  storeWeeklyAggregate: vi.fn().mockResolvedValue(undefined),
}));

describe('runComputeBaselineStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when DATABASE_URL is not configured', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValueOnce(false);

    await expect(runComputeBaselineStats({})).rejects.toThrow('DATABASE_URL not configured');
  });

  it('throws for unknown baseline ID', async () => {
    await expect(runComputeBaselineStats({ baseline: 'nonexistent' })).rejects.toThrow(
      'Unknown baseline',
    );
  });

  it('filters by baseline ID and stores results', async () => {
    const { computeBaseline, storeBaseline } = await import('@/lib/services/baseline-service');

    await runComputeBaselineStats({ baseline: 'biden_2022' });

    // Only one baseline should be computed (biden_2022)
    expect(computeBaseline).toHaveBeenCalledTimes(1);
    // Results should be stored
    expect(storeBaseline).toHaveBeenCalledTimes(1);
  });

  it('filters by category and stores only matching results', async () => {
    const { storeBaseline } = await import('@/lib/services/baseline-service');

    await runComputeBaselineStats({ baseline: 'biden_2022', category: 'executiveActions' });

    // storeBaseline should have been called (baseline returns executiveActions data)
    expect(storeBaseline).toHaveBeenCalledTimes(1);
  });

  it('processes all baselines when no filter specified', async () => {
    const { computeBaseline } = await import('@/lib/services/baseline-service');

    await runComputeBaselineStats({});

    // BASELINE_CONFIGS has 8 entries (4 cycle years × 2 administrations)
    expect(computeBaseline).toHaveBeenCalledTimes(8);
  });
});
