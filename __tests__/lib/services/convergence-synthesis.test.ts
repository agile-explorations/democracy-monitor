import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('@/lib/methodology/scoring-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/methodology/scoring-config')>();
  return {
    ...actual,
    getStructuralThreshold: vi.fn((category?: string) => {
      return actual.getStructuralThreshold(category ?? '');
    }),
  };
});
import { getStructuralThreshold } from '@/lib/methodology/scoring-config';
import { synthesizeConvergence } from '@/lib/services/convergence-synthesis';
import type { SilenceScore } from '@/lib/services/silence-detection-service';
import type {
  AIAssessmentSummary,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

const mockGetStructuralThreshold = vi.mocked(getStructuralThreshold);

function makeStructuralScore(overrides?: Partial<StructuralScore>): StructuralScore {
  const dim = { value: 0, baselineMean: 0, baselineStdDev: 1, zScore: 0, available: true };
  return {
    composite: 0,
    dimensions: {
      volume: { ...dim },
      typeComposition: { ...dim },
      functionalDistribution: { ...dim },
      agencyActivity: { ...dim },
      publicationTempo: { ...dim },
    },
    anomalous: false,
    functionalShifts: [],
    longHorizon: { cumulativeDeviation: 0, cumulativeWindow: 12, driftTrend: 'stable' },
    ...overrides,
  };
}

function makeThematicDrift(overrides?: Partial<ThematicDriftScore>): ThematicDriftScore {
  return {
    rollingCentroidDistance: 0.01,
    rollingWindow: { weeks: 8, meanDistance: 0.02, stdDev: 0.005 },
    zScore: 0,
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

function makeSilenceScore(overrides?: Partial<SilenceScore>): SilenceScore {
  return {
    govDocCount: 10,
    independentDocCount: 5,
    rollingGovMean: 12,
    rollingGovStdDev: 3,
    govSilenceZ: 0,
    silenceScore: 0,
    conspicuous: false,
    windowSize: 8,
    coldStart: false,
    ...overrides,
  };
}

describe('synthesizeConvergence', () => {
  describe('base cases — no active layer elevation', () => {
    it('returns Stable with normal inputs', () => {
      const result = synthesizeConvergence(makeStructuralScore(), null, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.layersElevated).toBe(0);
      expect(result.aiElevated).toBe(false);
      expect(result.silenceElevated).toBe(false);
    });

    it('returns Stable with all nulls', () => {
      const result = synthesizeConvergence(null, null, null);
      expect(result.status).toBe('Stable');
      expect(result.layersElevated).toBe(0);
    });

    it('structural anomaly alone does NOT elevate status (descriptive only)', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const result = synthesizeConvergence(structural, null, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.layersElevated).toBe(0);
      // Still tracked as metadata
      expect(result.structuralElevated).toBe(true);
    });

    it('thematic alone does NOT elevate status (descriptive only)', () => {
      const thematic = makeThematicDrift({ zScore: 4.0 });
      const result = synthesizeConvergence(makeStructuralScore(), null, thematic);
      expect(result.status).toBe('Stable');
      expect(result.layersElevated).toBe(0);
      expect(result.thematicElevated).toBe(true);
    });

    it('structural + thematic both elevated → still Stable (both descriptive only)', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const thematic = makeThematicDrift({ zScore: 4.0 });
      const result = synthesizeConvergence(structural, null, thematic);
      expect(result.status).toBe('Stable');
      expect(result.layersElevated).toBe(0);
      expect(result.structuralElevated).toBe(true);
      expect(result.thematicElevated).toBe(true);
    });
  });

  describe('AI layer elevation (L2)', () => {
    it('AI triggers Elevated when P1 flag rate elevated AND P2 confirms concern', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.1 });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
      expect(result.aiElevated).toBe(true);
      expect(result.layersElevated).toBe(1);
    });

    it('AI below threshold does not trigger', () => {
      const ai = makeAISummary({ flagRateZScore: 1.0 });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.aiElevated).toBe(false);
    });

    it('AI does NOT trigger when P1 elevated but P2 found nothing concerning', () => {
      const ai = makeAISummary({
        flagRateZScore: 2.0,
        concernRate: 0,
        concernDistribution: {
          routine: 5,
          novelNotConcerning: 0,
          potentiallyConcerning: 0,
          clearlyConcerning: 0,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.aiElevated).toBe(false);
    });

    it('AI triggers without P2 concern when flag rate is very strong (>3.0)', () => {
      const ai = makeAISummary({
        flagRateZScore: 3.5,
        concernRate: 0,
        concernDistribution: {
          routine: 5,
          novelNotConcerning: 0,
          potentiallyConcerning: 0,
          clearlyConcerning: 0,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
      expect(result.aiElevated).toBe(true);
    });

    it('AI does NOT trigger at exactly strong threshold without P2 concern', () => {
      const ai = makeAISummary({
        flagRateZScore: 3.0,
        concernRate: 0,
        concernDistribution: {
          routine: 5,
          novelNotConcerning: 0,
          potentiallyConcerning: 0,
          clearlyConcerning: 0,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.aiElevated).toBe(false);
    });
  });

  describe('silence detection elevation (L1v2)', () => {
    it('conspicuous silence triggers Elevated', () => {
      const silence = makeSilenceScore({ conspicuous: true, govSilenceZ: 2.0, silenceScore: 5.0 });
      const result = synthesizeConvergence(null, null, null, undefined, silence);
      expect(result.status).toBe('Elevated');
      expect(result.silenceElevated).toBe(true);
      expect(result.layersElevated).toBe(1);
    });

    it('non-conspicuous silence does not trigger', () => {
      const silence = makeSilenceScore({ conspicuous: false });
      const result = synthesizeConvergence(null, null, null, undefined, silence);
      expect(result.status).toBe('Stable');
      expect(result.silenceElevated).toBe(false);
    });

    it('null silence does not trigger', () => {
      const result = synthesizeConvergence(null, null, null, undefined, null);
      expect(result.status).toBe('Stable');
      expect(result.silenceElevated).toBe(false);
    });

    it('silence not provided (undefined) does not trigger', () => {
      const result = synthesizeConvergence(null, null, null);
      expect(result.status).toBe('Stable');
      expect(result.silenceElevated).toBe(false);
    });
  });

  describe('two-layer convergence (AI + silence)', () => {
    it('AI + silence → Divergent', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.1 });
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(null, ai, null, undefined, silence);
      expect(result.status).toBe('Divergent');
      expect(result.layersElevated).toBe(2);
    });

    it('AI + silence + high concern → ConfirmedConcern', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.3 });
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(null, ai, null, undefined, silence);
      expect(result.status).toBe('ConfirmedConcern');
      expect(result.layersElevated).toBe(2);
    });

    it('AI + silence + low concern → Divergent (not ConfirmedConcern)', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.1 });
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(null, ai, null, undefined, silence);
      expect(result.status).toBe('Divergent');
    });
  });

  describe('ConfirmedConcern gating', () => {
    it('does NOT trigger with high concern but only 1 layer elevated (AI only)', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.5 });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
    });

    it('does NOT trigger when concern rate is high but Pass 2 sample too small', () => {
      const ai = makeAISummary({
        flagRateZScore: 2.0,
        concernRate: 1.0,
        concernDistribution: {
          routine: 0,
          novelNotConcerning: 0,
          potentiallyConcerning: 1,
          clearlyConcerning: 0,
        },
      });
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(null, ai, null, undefined, silence);
      // 2 layers elevated but only 1 Pass 2 doc → highConcern gated off → Divergent
      expect(result.status).toBe('Divergent');
    });

    it('triggers at exactly the minimum sample size with 2 layers', () => {
      const ai = makeAISummary({
        flagRateZScore: 2.0,
        concernRate: 0.33,
        concernDistribution: {
          routine: 1,
          novelNotConcerning: 0,
          potentiallyConcerning: 1,
          clearlyConcerning: 1,
        },
      });
      const silence = makeSilenceScore({ conspicuous: true });
      // 3 Pass 2 docs — at minimum, 2/3 = 0.67 > 0.2 concern rate, 2 layers
      const result = synthesizeConvergence(null, ai, null, undefined, silence);
      expect(result.status).toBe('ConfirmedConcern');
    });
  });

  describe('AI minimum document gate', () => {
    it('high z-score with <10 docs stays Stable', () => {
      const ai = makeAISummary({ flagRateZScore: 3.0, totalDocuments: 5, flagCount: 3 });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.aiElevated).toBe(false);
    });

    it('exactly 10 docs triggers Elevated', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0, totalDocuments: 10, flagCount: 5 });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
      expect(result.aiElevated).toBe(true);
    });
  });

  describe('pattern descriptions', () => {
    it('describes stable pattern', () => {
      const result = synthesizeConvergence(makeStructuralScore(), null, makeThematicDrift());
      expect(result.pattern).toBe('All layers within baseline ranges');
    });

    it('describes AI flag rate elevated', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0 });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.pattern).toContain('AI flag rate elevated');
    });

    it('describes conspicuous silence', () => {
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(null, null, null, undefined, silence);
      expect(result.pattern).toContain('conspicuous government silence');
    });

    it('describes structural anomaly as descriptive only', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const result = synthesizeConvergence(structural, null, makeThematicDrift());
      expect(result.pattern).toContain('structural anomaly');
      expect(result.pattern).toContain('descriptive only');
    });

    it('describes thematic drift as descriptive only', () => {
      const thematic = makeThematicDrift({ zScore: 4.0 });
      const result = synthesizeConvergence(makeStructuralScore(), null, thematic);
      expect(result.pattern).toContain('thematic drift');
      expect(result.pattern).toContain('descriptive only');
    });

    it('describes all layers', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const ai = makeAISummary({ flagRateZScore: 2.0 });
      const thematic = makeThematicDrift({ zScore: 4.0 });
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(structural, ai, thematic, undefined, silence);
      expect(result.pattern).toContain('AI flag rate');
      expect(result.pattern).toContain('silence');
      expect(result.pattern).toContain('structural anomaly');
      expect(result.pattern).toContain('thematic drift');
    });
  });

  describe('structural metadata still tracked', () => {
    beforeEach(() => {
      mockGetStructuralThreshold.mockReset();
    });

    it('structuralElevated flag computed even though descriptive only', () => {
      mockGetStructuralThreshold.mockReturnValue(2.5);
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const result = synthesizeConvergence(structural, null, makeThematicDrift());
      expect(result.structuralElevated).toBe(true);
      // But does NOT drive status
      expect(result.status).toBe('Stable');
      expect(result.layersElevated).toBe(0);
    });

    it('uses per-category threshold for structuralElevated', () => {
      mockGetStructuralThreshold.mockReturnValue(5.0);
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const result = synthesizeConvergence(structural, null, null, 'thin_category');
      expect(result.structuralElevated).toBe(false);
    });

    it('different categories can have different thresholds', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      mockGetStructuralThreshold.mockReturnValue(5.0);
      const r1 = synthesizeConvergence(structural, null, null, 'elections');
      expect(r1.structuralElevated).toBe(false);
      mockGetStructuralThreshold.mockReturnValue(2.0);
      const r2 = synthesizeConvergence(structural, null, null, 'fiscal');
      expect(r2.structuralElevated).toBe(true);
    });
  });
});
