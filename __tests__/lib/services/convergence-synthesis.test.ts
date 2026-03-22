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

  describe('AI layer elevation (L2) — absolute P2 thresholds', () => {
    it('Elevated when ≥1 clearly_concerning', () => {
      const ai = makeAISummary({
        concernDistribution: {
          routine: 3,
          novelNotConcerning: 1,
          potentiallyConcerning: 0,
          clearlyConcerning: 1,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
      expect(result.aiElevated).toBe(true);
      expect(result.layersElevated).toBe(1);
    });

    it('Elevated when ≥2 potentially_concerning (no clearly)', () => {
      const ai = makeAISummary({
        concernDistribution: {
          routine: 3,
          novelNotConcerning: 0,
          potentiallyConcerning: 2,
          clearlyConcerning: 0,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
      expect(result.aiElevated).toBe(true);
    });

    it('Stable when only 1 potentially_concerning and 0 clearly_concerning', () => {
      const ai = makeAISummary({
        concernDistribution: {
          routine: 5,
          novelNotConcerning: 0,
          potentiallyConcerning: 1,
          clearlyConcerning: 0,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.aiElevated).toBe(false);
    });

    it('Stable when P2 found nothing concerning', () => {
      const ai = makeAISummary({
        concernDistribution: {
          routine: 5,
          novelNotConcerning: 2,
          potentiallyConcerning: 0,
          clearlyConcerning: 0,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.aiElevated).toBe(false);
    });

    it('null AI assessment stays Stable', () => {
      const result = synthesizeConvergence(makeStructuralScore(), null, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.aiElevated).toBe(false);
    });
  });

  describe('silence detection (descriptive only — does NOT drive status)', () => {
    it('conspicuous silence tracked as metadata but does NOT elevate status', () => {
      const silence = makeSilenceScore({ conspicuous: true, govSilenceZ: 2.0, silenceScore: 5.0 });
      const result = synthesizeConvergence(null, null, null, undefined, silence);
      expect(result.status).toBe('Stable');
      expect(result.silenceElevated).toBe(true);
      expect(result.layersElevated).toBe(0);
    });

    it('non-conspicuous silence does not flag', () => {
      const silence = makeSilenceScore({ conspicuous: false });
      const result = synthesizeConvergence(null, null, null, undefined, silence);
      expect(result.silenceElevated).toBe(false);
    });

    it('null silence does not flag', () => {
      const result = synthesizeConvergence(null, null, null, undefined, null);
      expect(result.silenceElevated).toBe(false);
    });

    it('silence not provided (undefined) does not flag', () => {
      const result = synthesizeConvergence(null, null, null);
      expect(result.silenceElevated).toBe(false);
    });
  });

  describe('AI + silence (silence does not affect status)', () => {
    it('AI elevated + silence → Elevated (not Divergent)', () => {
      const ai = makeAISummary({
        concernDistribution: {
          routine: 3,
          novelNotConcerning: 1,
          potentiallyConcerning: 0,
          clearlyConcerning: 1,
        },
      });
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(null, ai, null, undefined, silence);
      expect(result.status).toBe('Elevated');
      expect(result.layersElevated).toBe(1);
      expect(result.silenceElevated).toBe(true);
    });

    it('AI elevated + silence + high concern → ConfirmedConcern', () => {
      const ai = makeAISummary({
        concernRate: 0.4,
        concernDistribution: {
          routine: 1,
          novelNotConcerning: 0,
          potentiallyConcerning: 2,
          clearlyConcerning: 1,
        },
      });
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(null, ai, null, undefined, silence);
      expect(result.status).toBe('ConfirmedConcern');
      expect(result.layersElevated).toBe(1);
    });
  });

  describe('ConfirmedConcern gating (absolute P2 thresholds)', () => {
    it('triggers via ≥2 clearly_concerning path', () => {
      const ai = makeAISummary({
        concernRate: 0.5,
        concernDistribution: {
          routine: 1,
          novelNotConcerning: 1,
          potentiallyConcerning: 0,
          clearlyConcerning: 2,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('ConfirmedConcern');
      expect(result.layersElevated).toBe(1);
    });

    it('triggers via ≥3 concerning + ≥20% concern rate path', () => {
      const ai = makeAISummary({
        concernRate: 0.3,
        concernDistribution: {
          routine: 5,
          novelNotConcerning: 2,
          potentiallyConcerning: 2,
          clearlyConcerning: 1,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('ConfirmedConcern');
    });

    it('does NOT trigger when Pass 2 sample too small', () => {
      const ai = makeAISummary({
        concernRate: 1.0,
        concernDistribution: {
          routine: 0,
          novelNotConcerning: 0,
          potentiallyConcerning: 2,
          clearlyConcerning: 0,
        },
      });
      // Only 2 Pass 2 docs < min sample of 3 → highConcern gated → Elevated
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
    });

    it('does NOT trigger when concerning count < 3 and clearly < 2', () => {
      const ai = makeAISummary({
        concernRate: 0.25,
        concernDistribution: {
          routine: 4,
          novelNotConcerning: 2,
          potentiallyConcerning: 1,
          clearlyConcerning: 1,
        },
      });
      // 2 concerning (1+1) < 3 and 1 clearly < 2 → Elevated only
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
    });

    it('triggers at exactly the minimum sample size', () => {
      const ai = makeAISummary({
        concernRate: 0.67,
        concernDistribution: {
          routine: 1,
          novelNotConcerning: 0,
          potentiallyConcerning: 1,
          clearlyConcerning: 1,
        },
      });
      // 3 Pass 2 docs (at min), 2 concerning, but only 1 clearly → rate path: 2 < 3 → no
      // clearly path: 1 < 2 → no → Elevated only
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
    });

    it('triggers at min sample with 3 concerning', () => {
      const ai = makeAISummary({
        concernRate: 0.75,
        concernDistribution: {
          routine: 1,
          novelNotConcerning: 0,
          potentiallyConcerning: 2,
          clearlyConcerning: 1,
        },
      });
      // 4 P2 docs ≥ 3, 3 concerning ≥ 3, 0.75 > 0.2 → ConfirmedConcern
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('ConfirmedConcern');
    });
  });

  describe('pattern descriptions', () => {
    it('describes stable pattern', () => {
      const result = synthesizeConvergence(makeStructuralScore(), null, makeThematicDrift());
      expect(result.pattern).toBe('All layers within baseline ranges');
    });

    it('describes AI content assessment elevated', () => {
      const ai = makeAISummary({
        concernDistribution: {
          routine: 3,
          novelNotConcerning: 0,
          potentiallyConcerning: 0,
          clearlyConcerning: 1,
        },
      });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.pattern).toContain('AI content assessment elevated');
    });

    it('describes conspicuous silence as source health indicator', () => {
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(null, null, null, undefined, silence);
      expect(result.pattern).toContain('government silence detected (source health indicator)');
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
      const ai = makeAISummary({
        concernDistribution: {
          routine: 3,
          novelNotConcerning: 0,
          potentiallyConcerning: 0,
          clearlyConcerning: 1,
        },
      });
      const thematic = makeThematicDrift({ zScore: 4.0 });
      const silence = makeSilenceScore({ conspicuous: true });
      const result = synthesizeConvergence(structural, ai, thematic, undefined, silence);
      expect(result.pattern).toContain('AI content assessment');
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
