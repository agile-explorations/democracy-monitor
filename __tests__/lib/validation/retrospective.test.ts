import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/services/baseline-distributions', () => ({
  extractWeekMetadata: vi.fn(),
  computeBaselineStructuralDistribution: vi.fn(),
}));
vi.mock('@/lib/services/layer2-summary', () => ({
  buildAISummaryFromDB: vi.fn(),
}));
vi.mock('@/lib/services/semantic-drift-service', () => ({
  computeRollingThematicDrift: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  })),
  isDbAvailable: vi.fn(() => true),
}));
import {
  extractWeekMetadata,
  computeBaselineStructuralDistribution,
} from '@/lib/services/baseline-distributions';
import { buildAISummaryFromDB } from '@/lib/services/layer2-summary';
import { computeRollingThematicDrift } from '@/lib/services/semantic-drift-service';
import type { KnownEvent } from '@/lib/validation/known-events';
import { evaluateEvent } from '@/lib/validation/retrospective';

const mockExtractWeekMetadata = vi.mocked(extractWeekMetadata);
const mockComputeBaseline = vi.mocked(computeBaselineStructuralDistribution);
const mockBuildAISummary = vi.mocked(buildAISummaryFromDB);
const mockThematicDrift = vi.mocked(computeRollingThematicDrift);

const makeEvent = (overrides?: Partial<KnownEvent>): KnownEvent => ({
  id: 'TEST-1',
  date: '2025-02-03',
  category: 'civilLiberties',
  description: 'Test event',
  period: 'trump_t2',
  expectedMinStatus: 'Elevated',
  ...overrides,
});

describe('evaluateEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractWeekMetadata.mockResolvedValue(null);
    mockComputeBaseline.mockResolvedValue(null);
    mockBuildAISummary.mockResolvedValue(null);
    mockThematicDrift.mockResolvedValue(null);
  });

  it('returns Stable when no layer data is available', async () => {
    const result = await evaluateEvent(makeEvent());
    expect(result.recomputed.convergence.status).toBe('Stable');
    expect(result.recomputedDetected).toBe(false);
  });

  it('computes correct weekOf from event date', async () => {
    // 2025-02-05 is a Wednesday → Monday is 2025-02-03
    const result = await evaluateEvent(makeEvent({ date: '2025-02-05' }));
    expect(result.weekOf).toBe('2025-02-03');
  });

  it('detects event when convergence meets expected status', async () => {
    // Make L1 fire by providing structural data
    const weekMeta = {
      category: 'civilLiberties',
      weekOf: '2025-02-03',
      documentCount: 50,
      typeDistribution: { Notice: 0.8, Rule: 0.2 },
      functionalDistribution: { regulatory_action: 0.5, oversight: 0.3, routine_admin: 0.2 },
      agencyDistribution: { DOJ: 0.5, DHS: 0.5 },
      dailyCounts: [10, 8, 7, 8, 9, 5, 3],
      sourceConvergenceRatio: 0.5,
    };
    mockExtractWeekMetadata.mockResolvedValue(weekMeta as any);
    mockComputeBaseline.mockResolvedValue({
      baselineId: 'biden_2022',
      category: 'civilLiberties',
      meanDocCount: 10,
      stdDevDocCount: 3,
      typeDistribution: { Notice: 0.9, Rule: 0.1 },
      functionalDistribution: { regulatory_action: 0.5, oversight: 0.3, routine_admin: 0.2 },
      agencyDistribution: { DOJ: 0.5, DHS: 0.5 },
      meanDailyVariance: 2,
      stdDevDailyVariance: 1,
      meanSourceConvergenceRatio: 0.5,
      stdDevSourceConvergenceRatio: 0.1,
    } as any);

    const result = await evaluateEvent(makeEvent({ expectedMinStatus: 'Elevated' }));
    // With 50 docs vs baseline mean 10 (stddev 3), volume z-score = (50-10)/3 = 13.3
    // This should produce a high structural score -> Elevated
    expect(result.recomputed.structural).not.toBeNull();
    expect(result.recomputed.structural!.composite).toBeGreaterThan(2.5);
    expect(result.recomputedDetected).toBe(true);
  });

  it('marks event as missed when status is below expected', async () => {
    const result = await evaluateEvent(makeEvent({ expectedMinStatus: 'Divergent' }));
    expect(result.recomputedDetected).toBe(false);
  });

  it('handles L3 failure gracefully', async () => {
    mockThematicDrift.mockRejectedValue(new Error('No embeddings'));
    const result = await evaluateEvent(makeEvent());
    expect(result.recomputed.thematic).toBeNull();
    expect(result.recomputed.convergence.status).toBe('Stable');
  });

  it('includes stored data comparison', async () => {
    const result = await evaluateEvent(makeEvent());
    // No stored data in mocked DB
    expect(result.stored.status).toBeNull();
    expect(result.statusChanged).toBe(true); // null !== 'Stable'
  });
});
