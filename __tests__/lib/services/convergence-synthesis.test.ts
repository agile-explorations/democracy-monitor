import { describe, expect, it } from 'vitest';
import { synthesizeConvergence } from '@/lib/services/convergence-synthesis';
import type {
  AIAssessmentSummary,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

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

describe('synthesizeConvergence', () => {
  describe('backward compatibility — null AI parameter', () => {
    it('returns Stable when both L1 and L3 are normal', () => {
      const result = synthesizeConvergence(makeStructuralScore(), null, makeThematicDrift());
      expect(result.status).toBe('Stable');
      expect(result.layersElevated).toBe(0);
      expect(result.structuralElevated).toBe(false);
      expect(result.aiElevated).toBe(false);
      expect(result.thematicElevated).toBe(false);
    });

    it('returns Elevated when only structural is anomalous', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const result = synthesizeConvergence(structural, null, makeThematicDrift());
      expect(result.status).toBe('Elevated');
      expect(result.layersElevated).toBe(1);
      expect(result.structuralElevated).toBe(true);
    });

    it('returns Elevated when only thematic is elevated', () => {
      const thematic = makeThematicDrift({ zScore: 2.5 });
      const result = synthesizeConvergence(makeStructuralScore(), null, thematic);
      expect(result.status).toBe('Elevated');
      expect(result.layersElevated).toBe(1);
      expect(result.thematicElevated).toBe(true);
    });

    it('returns Divergent when L1 + L3 are elevated (no AI)', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const thematic = makeThematicDrift({ zScore: 2.5 });
      const result = synthesizeConvergence(structural, null, thematic);
      expect(result.status).toBe('Divergent');
      expect(result.layersElevated).toBe(2);
    });

    it('handles both null structural and thematic', () => {
      const result = synthesizeConvergence(null, null, null);
      expect(result.status).toBe('Stable');
      expect(result.layersElevated).toBe(0);
    });
  });

  describe('AI layer elevation', () => {
    it('AI alone triggers Elevated', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0 });
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
  });

  describe('ConfirmedConcern status', () => {
    it('triggers with 2+ layers elevated AND high concern rate', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.3 });
      const result = synthesizeConvergence(structural, ai, makeThematicDrift());
      expect(result.status).toBe('ConfirmedConcern');
      expect(result.layersElevated).toBe(2);
    });

    it('does NOT trigger with 2+ layers but low concern rate', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.1 });
      const result = synthesizeConvergence(structural, ai, makeThematicDrift());
      expect(result.status).toBe('Divergent');
    });

    it('does NOT trigger with high concern but only 1 layer elevated', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.5 });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.status).toBe('Elevated');
    });

    it('triggers with all 3 layers elevated + high concern', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.4 });
      const thematic = makeThematicDrift({ zScore: 2.5 });
      const result = synthesizeConvergence(structural, ai, thematic);
      expect(result.status).toBe('ConfirmedConcern');
      expect(result.layersElevated).toBe(3);
    });

    it('triggers with structural + thematic + high AI concern (AI not flag-elevated)', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const ai = makeAISummary({ flagRateZScore: 1.0, concernRate: 0.3 });
      const thematic = makeThematicDrift({ zScore: 2.5 });
      const result = synthesizeConvergence(structural, ai, thematic);
      // 2 layers elevated (structural + thematic), high concern → ConfirmedConcern
      expect(result.status).toBe('ConfirmedConcern');
    });
  });

  describe('bootstrap behavior', () => {
    it('thematic alone cannot trigger Elevated during bootstrap', () => {
      const thematic = makeThematicDrift({ zScore: 2.5, bootstrap: true });
      const result = synthesizeConvergence(makeStructuralScore(), null, thematic);
      expect(result.status).toBe('Stable');
      expect(result.bootstrap).toBe(true);
    });

    it('thematic can reinforce structural during bootstrap', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const thematic = makeThematicDrift({ zScore: 2.5, bootstrap: true });
      const result = synthesizeConvergence(structural, null, thematic);
      expect(result.status).toBe('Divergent');
      expect(result.layersElevated).toBe(2);
    });

    it('thematic can reinforce AI during bootstrap', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0, concernRate: 0.3 });
      const thematic = makeThematicDrift({ zScore: 2.5, bootstrap: true });
      const result = synthesizeConvergence(makeStructuralScore(), ai, thematic);
      expect(result.status).toBe('ConfirmedConcern');
      expect(result.layersElevated).toBe(2);
    });

    it('AI is not affected by bootstrap', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0 });
      const thematic = makeThematicDrift({ zScore: 0, bootstrap: true });
      const result = synthesizeConvergence(makeStructuralScore(), ai, thematic);
      expect(result.status).toBe('Elevated');
      expect(result.aiElevated).toBe(true);
    });
  });

  describe('pattern descriptions', () => {
    it('describes stable pattern', () => {
      const result = synthesizeConvergence(makeStructuralScore(), null, makeThematicDrift());
      expect(result.pattern).toBe('All layers within baseline ranges');
    });

    it('describes structural anomaly', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const result = synthesizeConvergence(structural, null, makeThematicDrift());
      expect(result.pattern).toContain('structural anomaly');
    });

    it('describes AI flag rate elevated', () => {
      const ai = makeAISummary({ flagRateZScore: 2.0 });
      const result = synthesizeConvergence(makeStructuralScore(), ai, makeThematicDrift());
      expect(result.pattern).toContain('AI flag rate elevated');
    });

    it('describes thematic drift', () => {
      const thematic = makeThematicDrift({ zScore: 2.5 });
      const result = synthesizeConvergence(makeStructuralScore(), null, thematic);
      expect(result.pattern).toContain('thematic drift');
    });

    it('describes multiple layers', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const ai = makeAISummary({ flagRateZScore: 2.0 });
      const thematic = makeThematicDrift({ zScore: 2.5 });
      const result = synthesizeConvergence(structural, ai, thematic);
      expect(result.pattern).toContain('structural anomaly');
      expect(result.pattern).toContain('AI flag rate');
      expect(result.pattern).toContain('thematic drift');
    });

    it('describes bootstrap thematic drift with reduced confidence', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const thematic = makeThematicDrift({ zScore: 2.5, bootstrap: true });
      const result = synthesizeConvergence(structural, null, thematic);
      expect(result.pattern).toContain('reduced confidence');
    });
  });
});
