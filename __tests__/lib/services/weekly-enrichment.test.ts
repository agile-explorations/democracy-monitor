import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getCycleYearForDate } from '@/lib/methodology/scoring-config';
import {
  extractWeekMetadata,
  computeBaselineStructuralDistribution,
} from '@/lib/services/baseline-distributions';
import { synthesizeConvergence } from '@/lib/services/concern-synthesis';
import { computeRollingThematicDrift } from '@/lib/services/semantic-drift-service';
import { computeStructuralScore } from '@/lib/services/structural-anomaly-service';
import type { WeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { computeStructuralLayer, enrichWithLayerScores } from '@/lib/services/weekly-enrichment';
import type {
  AIAssessmentSummary,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

// Mock all DB-dependent modules (vi.mock is hoisted by vitest)
vi.mock('@/lib/services/baseline-distributions', () => ({
  extractWeekMetadata: vi.fn(),
  computeBaselineStructuralDistribution: vi.fn(),
}));

vi.mock('@/lib/services/structural-anomaly-service', () => ({
  computeStructuralScore: vi.fn(),
}));

vi.mock('@/lib/services/semantic-drift-service', () => ({
  computeRollingThematicDrift: vi.fn(),
}));

vi.mock('@/lib/services/silence-detection-service', () => ({
  computeSilenceScore: vi.fn().mockResolvedValue(null),
  SILENCE_Z_THRESHOLD: 1.5,
}));

vi.mock('@/lib/services/concern-synthesis', () => ({
  synthesizeConvergence: vi.fn(),
}));

vi.mock('@/lib/data/baselines', () => ({
  BASELINE_CONFIGS: [
    {
      id: 'biden_2021',
      cycleYear: 1,
      administration: 'biden',
      from: '2021-01-20',
      to: '2022-01-19',
    },
    {
      id: 'biden_2022',
      cycleYear: 2,
      administration: 'biden',
      from: '2022-01-20',
      to: '2023-01-19',
    },
  ],
  getBaselineConfigForCycleYear: vi.fn((cy: number) => {
    if (cy === 1) return { id: 'biden_2021', cycleYear: 1, administration: 'biden' };
    return { id: 'biden_2022', cycleYear: 2, administration: 'biden' };
  }),
}));

vi.mock('@/lib/methodology/scoring-config', () => ({
  PRIMARY_BASELINE_ID: 'biden_2022',
  getCycleYearForDate: vi.fn(() => 2),
}));

vi.mock('@/lib/services/document-review-assessment-service', () => ({
  computeAIAssessmentSummary: vi.fn(),
}));

vi.mock('@/lib/services/document-review-store', () => ({
  getBaselineAIFlagRate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn(() => false),
  getDb: vi.fn(),
}));

vi.mock('@/lib/db/schema', () => ({
  aiDocumentAssessments: {},
}));

function makeDim() {
  return { value: 0, baselineMean: 0, baselineStdDev: 1, zScore: 0, available: true };
}

function makeStructural(overrides?: Partial<StructuralScore>): StructuralScore {
  return {
    composite: 1.5,
    dimensions: {
      volume: makeDim(),
      typeComposition: makeDim(),
      functionalDistribution: makeDim(),
      agencyActivity: makeDim(),
      publicationTempo: makeDim(),
    },
    anomalous: false,
    functionalShifts: [],
    longHorizon: { cumulativeDeviation: 0, cumulativeWindow: 12, driftTrend: 'stable' },
    ...overrides,
  };
}

function makeThematic(overrides?: Partial<ThematicDriftScore>): ThematicDriftScore {
  return {
    rollingCentroidDistance: 0.02,
    rollingWindow: { weeks: 8, meanDistance: 0.02, stdDev: 0.005 },
    zScore: 0.5,
    novelDocumentRate: 0,
    varianceRatio: 1,
    crossAdminDistance: 0.05,
    crossAdminBaseline: 'biden_2022',
    bootstrap: false,
    ...overrides,
  };
}

function makeAISummary(overrides?: Partial<AIAssessmentSummary>): AIAssessmentSummary {
  return {
    flagCount: 5,
    totalDocuments: 50,
    flagRate: 0.1,
    baselineFlagRate: 0.05,
    flagRateZScore: 0.5,
    concernDistribution: {
      routine: 3,
      novelNotConcerning: 1,
      potentiallyConcerning: 1,
      clearlyConcerning: 0,
    },
    concernRate: 0.1,
    auditSample: { sampled: 2, falseNegatives: 0, falseNegativeRate: 0 },
    pass1Model: 'gpt-4o-mini',
    pass2Model: 'claude-sonnet',
    ...overrides,
  };
}

function makeAggregate(overrides?: Partial<WeeklyAggregate>): WeeklyAggregate {
  return {
    category: 'civilService',
    weekOf: '2025-02-17',
    totalSeverity: 10,
    documentCount: 20,
    avgSeverityPerDoc: 0.5,
    captureProportion: 0.1,
    driftProportion: 0.3,
    warningProportion: 0.6,
    severityMix: 1.2,
    captureMatchCount: 2,
    driftMatchCount: 6,
    warningMatchCount: 12,
    suppressedMatchCount: 1,
    topKeywords: ['restructuring'],
    computedAt: '2025-02-22T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeStructuralLayer', () => {
  it('returns null when no week metadata is available', async () => {
    vi.mocked(extractWeekMetadata).mockResolvedValue(null);
    const result = await computeStructuralLayer('civilService', '2025-02-17');
    expect(result).toBeNull();
  });

  it('returns null when baseline distribution is unavailable', async () => {
    vi.mocked(extractWeekMetadata).mockResolvedValue({
      category: 'civilService',
      weekOf: '2025-02-17',
      documentCount: 10,
      typeDistribution: { Notice: 0.8, Rule: 0.2 },
      functionalDistribution: { rulemaking: 0.5, administrative_procedure: 0.5 } as Record<
        string,
        number
      >,
      agencyDistribution: { DOJ: 0.5, EPA: 0.5 },
      dailyCounts: [1, 2, 3, 1, 2, 1, 0],
    });
    vi.mocked(computeBaselineStructuralDistribution).mockResolvedValue(null);
    const result = await computeStructuralLayer('civilService', '2025-02-17');
    expect(result).toBeNull();
  });

  it('uses cycle-year-matched baseline and returns its structural score', async () => {
    // getCycleYearForDate mock returns 1 → getBaselineConfigForCycleYear returns biden_2021
    vi.mocked(getCycleYearForDate).mockReturnValue(1);
    vi.mocked(extractWeekMetadata).mockResolvedValue({
      category: 'civilService',
      weekOf: '2025-02-17',
      documentCount: 10,
      typeDistribution: { Notice: 1 },
      functionalDistribution: { rulemaking: 1 } as Record<string, number>,
      agencyDistribution: { DOJ: 1 },
      dailyCounts: [1, 2, 3, 1, 2, 1, 0],
    });
    vi.mocked(computeBaselineStructuralDistribution).mockResolvedValue({
      baselineId: 'biden_2021',
      category: 'civilService',
      meanDocCount: 12,
      stdDevDocCount: 4,
      typeDistribution: { Notice: 1 },
      functionalDistribution: { rulemaking: 1 } as Record<string, number>,
      agencyDistribution: { DOJ: 1 },
      meanDailyVariance: 1,
      stdDevDailyVariance: 0.5,
    });
    const expected = makeStructural({ composite: 1.8 });
    vi.mocked(computeStructuralScore).mockReturnValue(expected);

    const result = await computeStructuralLayer('civilService', '2025-02-17');
    expect(result).toBe(expected);
    expect(result?.composite).toBe(1.8);
  });

  it('returns structural score when both metadata and baseline are available', async () => {
    const mockMetadata = {
      category: 'civilService',
      weekOf: '2025-02-17',
      documentCount: 10,
      typeDistribution: { Notice: 1 },
      functionalDistribution: { rulemaking: 1 } as Record<string, number>,
      agencyDistribution: { DOJ: 1 },
      dailyCounts: [1, 2, 3, 1, 2, 1, 0],
    };
    const mockBaseline = {
      baselineId: 'biden_2022',
      category: 'civilService',
      meanDocCount: 15,
      stdDevDocCount: 5,
      typeDistribution: { Notice: 1 },
      functionalDistribution: { rulemaking: 1 } as Record<string, number>,
      agencyDistribution: { DOJ: 1 },
      meanDailyVariance: 1,
      stdDevDailyVariance: 0.5,
    };
    const expected = makeStructural({ composite: 2.5 });

    vi.mocked(extractWeekMetadata).mockResolvedValue(mockMetadata);
    vi.mocked(computeBaselineStructuralDistribution).mockResolvedValue(mockBaseline);
    vi.mocked(computeStructuralScore).mockReturnValue(expected);

    const result = await computeStructuralLayer('civilService', '2025-02-17');
    expect(result).toBe(expected);
  });
});

describe('enrichWithLayerScores', () => {
  it('enriches aggregate with all layer scores and convergence', async () => {
    const structural = makeStructural({ composite: 2.5 });
    const thematic = makeThematic({ zScore: 1.2 });
    const aiSummary = makeAISummary({ flagRateZScore: 0.8 });
    const convergence = {
      status: 'Elevated' as const,
      structuralElevated: true,
      aiElevated: false,
      silenceElevated: false,
      thematicElevated: false,
      layersElevated: 1,
      pattern: 'structural anomaly detected',
      bootstrap: false,
    };

    vi.mocked(computeRollingThematicDrift).mockResolvedValue(thematic);
    vi.mocked(extractWeekMetadata).mockResolvedValue({
      category: 'civilService',
      weekOf: '2025-02-17',
      documentCount: 10,
      typeDistribution: {},
      functionalDistribution: {} as Record<string, number>,
      agencyDistribution: {},
      dailyCounts: [],
    });
    vi.mocked(computeBaselineStructuralDistribution).mockResolvedValue({
      baselineId: 'biden_2022',
      category: 'civilService',
      meanDocCount: 10,
      stdDevDocCount: 3,
      typeDistribution: {},
      functionalDistribution: {} as Record<string, number>,
      agencyDistribution: {},
      meanDailyVariance: 1,
      stdDevDailyVariance: 0.5,
    });
    vi.mocked(computeStructuralScore).mockReturnValue(structural);
    vi.mocked(synthesizeConvergence).mockReturnValue(convergence);

    const agg = makeAggregate();
    const result = await enrichWithLayerScores(agg, aiSummary);

    expect(result.structuralScore).toBe(2.5);
    expect(result.structuralDetail).toBe(structural);
    expect(result.thematicScore).toBe(1.2);
    expect(result.thematicDetail).toBe(thematic);
    expect(result.convergenceScore).toBe(1);
    expect(result.convergenceDetail).toBe(convergence);
    expect(result.aiScore).toBe(0.8);
    expect(result.aiDetail).toBe(aiSummary);
  });

  it('preserves original aggregate fields', async () => {
    vi.mocked(computeRollingThematicDrift).mockResolvedValue(null);
    vi.mocked(extractWeekMetadata).mockResolvedValue(null);
    vi.mocked(synthesizeConvergence).mockReturnValue({
      status: 'Stable',
      structuralElevated: false,
      aiElevated: false,
      silenceElevated: false,
      thematicElevated: false,
      layersElevated: 0,
      pattern: 'All layers within baseline ranges',
      bootstrap: true,
    });

    const agg = makeAggregate({ totalSeverity: 42, documentCount: 100 });
    const result = await enrichWithLayerScores(agg);

    expect(result.totalSeverity).toBe(42);
    expect(result.documentCount).toBe(100);
    expect(result.category).toBe('civilService');
  });

  it('handles null structural and thematic scores gracefully', async () => {
    vi.mocked(computeRollingThematicDrift).mockResolvedValue(null);
    vi.mocked(extractWeekMetadata).mockResolvedValue(null);
    vi.mocked(synthesizeConvergence).mockReturnValue({
      status: 'Stable',
      structuralElevated: false,
      aiElevated: false,
      silenceElevated: false,
      thematicElevated: false,
      layersElevated: 0,
      pattern: 'All layers within baseline ranges',
      bootstrap: true,
    });

    const result = await enrichWithLayerScores(makeAggregate());

    expect(result.structuralScore).toBeUndefined();
    expect(result.thematicScore).toBeUndefined();
    expect(result.convergenceScore).toBe(0);
  });

  it('returns original aggregate when layer scoring throws', async () => {
    vi.mocked(extractWeekMetadata).mockRejectedValue(new Error('DB down'));

    const agg = makeAggregate();
    const result = await enrichWithLayerScores(agg);

    expect(result).toBe(agg);
    expect(result.structuralScore).toBeUndefined();
  });

  it('passes null AI summary to convergence when not provided', async () => {
    vi.mocked(computeRollingThematicDrift).mockResolvedValue(null);
    vi.mocked(extractWeekMetadata).mockResolvedValue(null);
    vi.mocked(synthesizeConvergence).mockReturnValue({
      status: 'Stable',
      structuralElevated: false,
      aiElevated: false,
      silenceElevated: false,
      thematicElevated: false,
      layersElevated: 0,
      pattern: 'All layers within baseline ranges',
      bootstrap: true,
    });

    const result = await enrichWithLayerScores(makeAggregate());

    // With no layers available, convergence should be Stable
    expect(result.convergenceDetail?.status).toBe('Stable');
    expect(result.convergenceDetail?.layersElevated).toBe(0);
  });

  it('passes AI summary through to convergence synthesis', async () => {
    const aiSummary = makeAISummary({
      concernDistribution: {
        routine: 3,
        novelNotConcerning: 0,
        potentiallyConcerning: 0,
        clearlyConcerning: 1,
      },
    });
    vi.mocked(computeRollingThematicDrift).mockResolvedValue(null);
    vi.mocked(extractWeekMetadata).mockResolvedValue(null);
    vi.mocked(synthesizeConvergence).mockReturnValue({
      status: 'Elevated',
      structuralElevated: false,
      aiElevated: true,
      silenceElevated: false,
      thematicElevated: false,
      layersElevated: 1,
      pattern: 'AI content assessment elevated',
      bootstrap: true,
    });

    const result = await enrichWithLayerScores(makeAggregate(), aiSummary);

    // AI elevation should propagate to convergence
    expect(result.convergenceDetail?.status).toBe('Elevated');
    expect(result.convergenceDetail?.aiElevated).toBe(true);
    expect(result.aiDetail).toBe(aiSummary);
  });
});
