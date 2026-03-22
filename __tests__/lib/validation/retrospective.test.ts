import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/services/baseline-distributions', () => ({
  extractWeekMetadata: vi.fn(),
  computeBaselineStructuralDistribution: vi.fn(),
}));
vi.mock('@/lib/services/document-review-summary', () => ({
  buildAISummaryFromDB: vi.fn(),
}));
vi.mock('@/lib/services/semantic-drift-service', () => ({
  computeRollingThematicDrift: vi.fn(),
}));
vi.mock('@/lib/services/silence-detection-service', () => ({
  computeSilenceScore: vi.fn().mockResolvedValue(null),
  SILENCE_Z_THRESHOLD: 1.5,
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
import { buildAISummaryFromDB } from '@/lib/services/document-review-summary';
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
    // Make L2 AI fire — AI is an active detection layer that drives convergence
    mockBuildAISummary.mockResolvedValue({
      flagCount: 8,
      totalDocuments: 50,
      flagRate: 0.16,
      baselineFlagRate: 0.05,
      flagRateZScore: 2.5,
      concernDistribution: {
        routine: 2,
        novelNotConcerning: 1,
        potentiallyConcerning: 3,
        clearlyConcerning: 2,
      },
      concernRate: 0.625,
      auditSample: { sampled: 2, falseNegatives: 0, falseNegativeRate: 0 },
      pass1Model: 'gpt-4o-mini',
      pass2Model: 'claude-sonnet',
    });

    const result = await evaluateEvent(makeEvent({ expectedMinStatus: 'Elevated' }));
    // 2 clearly_concerning ≥ P2_CONFIRMED_MIN_CLEARLY → ConfirmedConcern
    expect(result.recomputed.convergence.aiElevated).toBe(true);
    expect(result.recomputed.convergence.status).toBe('ConfirmedConcern');
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
