import { describe, it, expect } from 'vitest';
import { flattenWeeklyRow, flattenScoresRow } from '@/lib/utils/csv-flatten';

describe('flattenWeeklyRow', () => {
  const baseRow = {
    id: 1,
    category: 'judiciary',
    weekOf: '2025-01-06',
    totalSeverity: 12.5,
    documentCount: 10,
    avgSeverityPerDoc: 1.25,
    captureProportion: 0.3,
    driftProportion: 0.1,
    warningProportion: 0.05,
    severityMix: 0.4,
    captureMatchCount: 3,
    driftMatchCount: 1,
    warningMatchCount: 0,
    suppressedMatchCount: 2,
    topKeywords: ['executive order', 'mandate'],
    structuralScore: 45,
    structuralDetail: null,
    thematicScore: 30,
    thematicDetail: null,
    convergenceScore: 0,
    convergenceDetail: null,
    aiScore: 20,
    aiDetail: null,
    computedAt: '2025-01-07T00:00:00.000Z',
  };

  it('flattens scalar fields unchanged', () => {
    const flat = flattenWeeklyRow(baseRow);
    expect(flat.id).toBe(1);
    expect(flat.category).toBe('judiciary');
    expect(flat.weekOf).toBe('2025-01-06');
    expect(flat.totalSeverity).toBe(12.5);
  });

  it('joins topKeywords into comma-separated string', () => {
    const flat = flattenWeeklyRow(baseRow);
    expect(flat.topKeywords).toBe('executive order, mandate');
  });

  it('returns empty strings for null jsonb columns', () => {
    const flat = flattenWeeklyRow(baseRow);
    expect(flat.structural_composite).toBe('');
    expect(flat.ai_flagCount).toBe('');
    expect(flat.thematic_centroidDistance).toBe('');
    expect(flat.concern_status).toBe('');
  });

  it('flattens structuralDetail when present', () => {
    const row = {
      ...baseRow,
      structuralDetail: {
        composite: 55,
        dimensions: {
          volume: { zScore: 1.2, value: 10, baselineMean: 8, baselineStdDev: 2, available: true },
          typeComposition: {
            zScore: 0.5,
            value: 3,
            baselineMean: 3,
            baselineStdDev: 1,
            available: true,
          },
          functionalDistribution: {
            zScore: -0.3,
            value: 5,
            baselineMean: 5,
            baselineStdDev: 1,
            available: true,
          },
          agencyActivity: {
            zScore: 2.1,
            value: 7,
            baselineMean: 4,
            baselineStdDev: 1.5,
            available: true,
          },
          publicationTempo: {
            zScore: 0.0,
            value: 2,
            baselineMean: 2,
            baselineStdDev: 0.5,
            available: true,
          },
          sourceConvergence: {
            zScore: 1.8,
            value: 0.9,
            baselineMean: 0.5,
            baselineStdDev: 0.2,
            available: true,
          },
        },
        anomalous: true,
        functionalShifts: [
          {
            bucket: 'rulemaking',
            baselineRate: 0.3,
            currentRate: 0.5,
            direction: 'increased' as const,
          },
        ],
        longHorizon: {
          cumulativeDeviation: 3.5,
          cumulativeWindow: 8,
          driftTrend: 'increasing' as const,
        },
      },
    };
    const flat = flattenWeeklyRow(row);
    expect(flat.structural_composite).toBe(55);
    expect(flat.structural_volume).toBe(1.2);
    expect(flat.structural_volume_raw).toBe(10);
    expect(flat.structural_volume_baselineMean).toBe(8);
    expect(flat.structural_volume_baselineStdDev).toBe(2);
    expect(flat.structural_agencyActivity).toBe(2.1);
    expect(flat.structural_agencyActivity_raw).toBe(7);
    expect(flat.structural_sourceConvergence).toBe(1.8);
    expect(flat.structural_sourceConvergence_raw).toBe(0.9);
    expect(flat.structural_anomalous).toBe(1);
    expect(flat.structural_driftTrend).toBe('increasing');
    expect(flat.structural_longHorizon_cumulativeDeviation).toBe(3.5);
    expect(flat.structural_longHorizon_cumulativeWindow).toBe(8);
    expect(flat.structural_functionalShifts).toBe('rulemaking:increased');
  });

  it('flattens aiDetail when present', () => {
    const row = {
      ...baseRow,
      aiDetail: {
        flagCount: 5,
        totalDocuments: 100,
        flagRate: 0.05,
        baselineFlagRate: 0.03,
        flagRateZScore: 1.5,
        concernDistribution: {
          routine: 80,
          novelNotConcerning: 10,
          potentiallyConcerning: 3,
          clearlyConcerning: 2,
        },
        concernRate: 0.05,
        auditSample: { sampled: 10, falseNegatives: 1, falseNegativeRate: 0.1 },
        pass1Model: 'gpt-4o-mini',
        pass2Model: 'claude-sonnet',
      },
    };
    const flat = flattenWeeklyRow(row);
    expect(flat.ai_flagCount).toBe(5);
    expect(flat.ai_totalDocuments).toBe(100);
    expect(flat.ai_concernRate).toBe(0.05);
    expect(flat.ai_p2_routine).toBe(80);
    expect(flat.ai_p2_clearlyConcerning).toBe(2);
    expect(flat.ai_auditFalseNegativeRate).toBe(0.1);
  });

  it('flattens thematicDetail when present', () => {
    const row = {
      ...baseRow,
      thematicDetail: {
        rollingCentroidDistance: 0.15,
        rollingWindow: { weeks: 8, meanDistance: 0.1, stdDev: 0.03 },
        zScore: 1.67,
        novelDocumentRate: 0.25,
        varianceRatio: 1.1,
        crossAdminDistance: 0.3,
        crossAdminBaseline: 'biden-2022',
        bootstrap: false,
      },
    };
    const flat = flattenWeeklyRow(row);
    expect(flat.thematic_centroidDistance).toBe(0.15);
    expect(flat.thematic_zScore).toBe(1.67);
    expect(flat.thematic_novelDocRate).toBe(0.25);
    expect(flat.thematic_crossAdminDistance).toBe(0.3);
    expect(flat.thematic_rollingWindow_weeks).toBe(8);
    expect(flat.thematic_rollingWindow_meanDistance).toBe(0.1);
    expect(flat.thematic_rollingWindow_stdDev).toBe(0.03);
    expect(flat.thematic_crossAdminBaseline).toBe('biden-2022');
    expect(flat.thematic_bootstrap).toBe(0);
  });

  it('flattens convergenceDetail when present', () => {
    const row = {
      ...baseRow,
      convergenceDetail: {
        status: 'Elevated' as const,
        pattern: 'AI-only elevation',
        structuralElevated: false,
        aiElevated: true,
        silenceElevated: false,
        thematicElevated: false,
        layersElevated: 1,
        bootstrap: false,
      },
    };
    const flat = flattenWeeklyRow(row);
    expect(flat.concern_status).toBe('Elevated');
    expect(flat.concern_pattern).toBe('AI-only elevation');
    expect(flat.concern_structuralElevated).toBe(0);
    expect(flat.concern_aiElevated).toBe(1);
  });

  it('handles Date computedAt', () => {
    const row = { ...baseRow, computedAt: new Date('2025-01-07T12:00:00Z') };
    const flat = flattenWeeklyRow(row);
    expect(flat.computedAt).toBe('2025-01-07T12:00:00.000Z');
  });

  it('handles null topKeywords', () => {
    const row = { ...baseRow, topKeywords: null };
    const flat = flattenWeeklyRow(row);
    expect(flat.topKeywords).toBe('');
  });
});

describe('flattenScoresRow', () => {
  const baseRow = {
    id: 42,
    documentId: 100,
    url: 'https://example.com/doc',
    category: 'judiciary',
    severityScore: 3.5,
    finalScore: 4.2,
    captureCount: 2,
    driftCount: 1,
    warningCount: 0,
    suppressedCount: 1,
    documentClass: 'executive_action',
    classMultiplier: 1.5,
    isHighAuthority: true,
    matches: [
      { keyword: 'executive order', tier: 'capture' },
      { keyword: 'mandate', tier: 'capture' },
    ],
    suppressed: [{ keyword: 'routine', tier: 'suppressed' }],
    scoredAt: '2025-01-07T00:00:00.000Z',
    weekOf: '2025-01-06',
  };

  it('flattens scalar fields unchanged', () => {
    const flat = flattenScoresRow(baseRow);
    expect(flat.id).toBe(42);
    expect(flat.category).toBe('judiciary');
    expect(flat.finalScore).toBe(4.2);
    expect(flat.isHighAuthority).toBe(true);
  });

  it('extracts matches count and keywords', () => {
    const flat = flattenScoresRow(baseRow);
    expect(flat.matches_count).toBe(2);
    expect(flat.matches_keywords).toBe('executive order, mandate');
  });

  it('extracts suppressed count and keywords', () => {
    const flat = flattenScoresRow(baseRow);
    expect(flat.suppressed_count).toBe(1);
    expect(flat.suppressed_keywords).toBe('routine');
  });

  it('handles empty matches/suppressed arrays', () => {
    const row = { ...baseRow, matches: [], suppressed: [] };
    const flat = flattenScoresRow(row);
    expect(flat.matches_count).toBe(0);
    expect(flat.matches_keywords).toBe('');
    expect(flat.suppressed_count).toBe(0);
    expect(flat.suppressed_keywords).toBe('');
  });

  it('handles Date scoredAt', () => {
    const row = { ...baseRow, scoredAt: new Date('2025-01-07T12:00:00Z') };
    const flat = flattenScoresRow(row);
    expect(flat.scoredAt).toBe('2025-01-07T12:00:00.000Z');
  });

  it('handles null documentId', () => {
    const row = { ...baseRow, documentId: null };
    const flat = flattenScoresRow(row);
    expect(flat.documentId).toBe(null);
  });
});
