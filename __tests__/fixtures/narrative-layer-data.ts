import type { NarrativeLayerData } from '@/lib/types';
import type { ConvergenceSynthesis, ThematicDriftScore } from '@/lib/types/structural';

/** Build a NarrativeLayerData fixture with sensible defaults and optional overrides. */
export function makeLayerData(overrides: Partial<NarrativeLayerData> = {}): NarrativeLayerData {
  return {
    category: 'civilService',
    categoryTitle: 'Government Worker Protections',
    categoryDescription: 'Government actions that reduce protections for civil servants',
    weekOf: '2026-02-17',
    structuralScore: 0.75,
    structuralDetail: {
      composite: 0.75,
      dimensions: {
        volume: {
          value: 0.5,
          baselineMean: 0.3,
          baselineStdDev: 0.1,
          zScore: 2.0,
          available: true,
        },
        typeComposition: {
          value: 0.5,
          baselineMean: 0.3,
          baselineStdDev: 0.1,
          zScore: 2.0,
          available: true,
        },
        functionalDistribution: {
          value: 0.5,
          baselineMean: 0.3,
          baselineStdDev: 0.1,
          zScore: 2.0,
          available: true,
        },
        agencyActivity: {
          value: 0.5,
          baselineMean: 0.3,
          baselineStdDev: 0.1,
          zScore: 2.0,
          available: true,
        },
        publicationTempo: {
          value: 0.5,
          baselineMean: 0.3,
          baselineStdDev: 0.1,
          zScore: 2.0,
          available: true,
        },
      },
      anomalous: true,
      functionalShifts: [],
      longHorizon: { cumulativeDeviation: 3.0, cumulativeWindow: 16, driftTrend: 'increasing' },
    },
    aiScore: 0.8,
    aiDetail: {
      flagCount: 10,
      totalDocuments: 100,
      flagRate: 0.1,
      baselineFlagRate: 0.02,
      flagRateZScore: 2.5,
      concernDistribution: {
        routine: 5,
        novelNotConcerning: 2,
        potentiallyConcerning: 2,
        clearlyConcerning: 1,
      },
      concernRate: 0.3,
      auditSample: { sampled: 3, falseNegatives: 0, falseNegativeRate: 0 },
      pass1Model: 'gpt-4o-mini',
      pass2Model: 'claude-sonnet-4-5-20250929',
    },
    thematicScore: 0.65,
    thematicDetail: {
      rollingCentroidDistance: 0.12,
      rollingWindow: { weeks: 8, meanDistance: 0.06, stdDev: 0.02 },
      zScore: 3.0,
      novelDocumentRate: 0.08,
      varianceRatio: 1.5,
      crossAdminDistance: null,
      crossAdminBaseline: null,
      bootstrap: false,
    } as ThematicDriftScore,
    convergenceScore: 0.8,
    convergenceDetail: {
      status: 'Elevated',
      structuralElevated: true,
      aiElevated: false,
      silenceElevated: false,
      thematicElevated: false,
      layersElevated: 1,
      pattern: 'structural only',
      bootstrap: false,
    },
    ...overrides,
  };
}
