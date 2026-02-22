import { describe, expect, it } from 'vitest';
import { synthesizeConvergence } from '@/lib/services/convergence-synthesis';
import type { StructuralScore, ThematicDriftScore } from '@/lib/types/structural';

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

describe('synthesizeConvergence', () => {
  it('returns Stable when both layers are normal', () => {
    const result = synthesizeConvergence(makeStructuralScore(), makeThematicDrift());
    expect(result.status).toBe('Stable');
    expect(result.layersElevated).toBe(0);
    expect(result.structuralElevated).toBe(false);
    expect(result.thematicElevated).toBe(false);
  });

  it('returns Elevated when only structural is anomalous', () => {
    const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
    const result = synthesizeConvergence(structural, makeThematicDrift());
    expect(result.status).toBe('Elevated');
    expect(result.layersElevated).toBe(1);
    expect(result.structuralElevated).toBe(true);
    expect(result.thematicElevated).toBe(false);
  });

  it('returns Elevated when only thematic is elevated', () => {
    const thematic = makeThematicDrift({ zScore: 2.5 });
    const result = synthesizeConvergence(makeStructuralScore(), thematic);
    expect(result.status).toBe('Elevated');
    expect(result.layersElevated).toBe(1);
    expect(result.thematicElevated).toBe(true);
  });

  it('returns Divergent when both layers are elevated', () => {
    const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
    const thematic = makeThematicDrift({ zScore: 2.5 });
    const result = synthesizeConvergence(structural, thematic);
    expect(result.status).toBe('Divergent');
    expect(result.layersElevated).toBe(2);
  });

  it('handles null structural score', () => {
    const result = synthesizeConvergence(null, makeThematicDrift({ zScore: 2.5 }));
    expect(result.status).toBe('Elevated');
    expect(result.structuralElevated).toBe(false);
    expect(result.thematicElevated).toBe(true);
  });

  it('handles null thematic score', () => {
    const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
    const result = synthesizeConvergence(structural, null);
    expect(result.status).toBe('Elevated');
    expect(result.structuralElevated).toBe(true);
  });

  it('handles both null scores', () => {
    const result = synthesizeConvergence(null, null);
    expect(result.status).toBe('Stable');
    expect(result.layersElevated).toBe(0);
  });

  describe('bootstrap behavior', () => {
    it('thematic alone cannot trigger Elevated during bootstrap', () => {
      const thematic = makeThematicDrift({ zScore: 2.5, bootstrap: true });
      const result = synthesizeConvergence(makeStructuralScore(), thematic);
      expect(result.status).toBe('Stable');
      expect(result.bootstrap).toBe(true);
    });

    it('thematic can reinforce structural during bootstrap', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const thematic = makeThematicDrift({ zScore: 2.5, bootstrap: true });
      const result = synthesizeConvergence(structural, thematic);
      expect(result.status).toBe('Divergent');
      expect(result.layersElevated).toBe(2);
      expect(result.bootstrap).toBe(true);
    });

    it('structural alone triggers Elevated during bootstrap', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const thematic = makeThematicDrift({ zScore: 0.5, bootstrap: true });
      const result = synthesizeConvergence(structural, thematic);
      expect(result.status).toBe('Elevated');
      expect(result.layersElevated).toBe(1);
    });
  });

  describe('pattern descriptions', () => {
    it('describes stable pattern', () => {
      const result = synthesizeConvergence(makeStructuralScore(), makeThematicDrift());
      expect(result.pattern).toBe('All layers within baseline ranges');
    });

    it('describes structural anomaly', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const result = synthesizeConvergence(structural, makeThematicDrift());
      expect(result.pattern).toContain('structural anomaly');
    });

    it('describes thematic drift', () => {
      const thematic = makeThematicDrift({ zScore: 2.5 });
      const result = synthesizeConvergence(makeStructuralScore(), thematic);
      expect(result.pattern).toContain('thematic drift');
    });

    it('describes bootstrap thematic drift with reduced confidence', () => {
      const structural = makeStructuralScore({ composite: 3.0, anomalous: true });
      const thematic = makeThematicDrift({ zScore: 2.5, bootstrap: true });
      const result = synthesizeConvergence(structural, thematic);
      expect(result.pattern).toContain('reduced confidence');
    });
  });
});
