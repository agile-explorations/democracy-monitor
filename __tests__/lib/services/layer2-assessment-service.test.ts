import { describe, expect, it } from 'vitest';
import {
  selectAuditSample,
  computeAIAssessmentSummary,
} from '@/lib/services/layer2-assessment-service';
import type { Pass1Result, Pass2Result } from '@/lib/services/layer2-assessment-service';

function makePass1(url: string, relevant: boolean): Pass1Result {
  return {
    url,
    response: {
      relevant,
      confidence: 0.8,
      signals: relevant ? ['signal'] : [],
      erosionType: relevant ? 'operational_hollowing' : 'routine',
    },
    meta: {
      model: 'gpt-4o-mini',
      provider: 'openai',
      tokensInput: 100,
      tokensOutput: 50,
      latencyMs: 200,
    },
  };
}

function makePass2(
  url: string,
  assessment: 'routine' | 'novel_not_concerning' | 'potentially_concerning' | 'clearly_concerning',
  isAuditSample = false,
): Pass2Result {
  return {
    url,
    response: {
      assessment,
      confidence: 0.7,
      reasoning: 'test',
      comparativeContext: 'test',
      citedPassages: [],
      erosionType: 'routine',
      counterArguments: [],
    },
    meta: {
      model: 'claude-sonnet',
      provider: 'anthropic',
      tokensInput: 200,
      tokensOutput: 100,
      latencyMs: 500,
    },
    isAuditSample,
  };
}

describe('selectAuditSample', () => {
  it('returns empty array for zero sample rate', () => {
    expect(selectAuditSample(['a', 'b', 'c'], 0)).toEqual([]);
  });

  it('returns empty array for empty URL list', () => {
    expect(selectAuditSample([], 0.1)).toEqual([]);
  });

  it('returns at least 1 item for small lists', () => {
    const result = selectAuditSample(['a', 'b', 'c'], 0.03);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns correct percentage for larger lists', () => {
    const urls = Array.from({ length: 100 }, (_, i) => `url-${i}`);
    const result = selectAuditSample(urls, 0.1);
    expect(result.length).toBe(10);
  });

  it('produces deterministic results', () => {
    const urls = ['c', 'a', 'b', 'd', 'e'];
    const r1 = selectAuditSample(urls, 0.4);
    const r2 = selectAuditSample(urls, 0.4);
    expect(r1).toEqual(r2);
  });

  it('sorts alphabetically for determinism', () => {
    const urls = ['c', 'a', 'b'];
    const result = selectAuditSample(urls, 1.0);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('does not exceed list length', () => {
    const result = selectAuditSample(['a'], 0.5);
    expect(result.length).toBe(1);
  });
});

describe('computeAIAssessmentSummary', () => {
  it('computes flag rate and z-score', () => {
    const pass1 = [
      makePass1('a', true),
      makePass1('b', false),
      makePass1('c', false),
      makePass1('d', true),
    ];
    const pass2 = [makePass2('a', 'potentially_concerning'), makePass2('d', 'routine')];

    const result = computeAIAssessmentSummary(pass1, pass2, 0.1, 0.05, 'gpt-4o-mini', 'claude');

    expect(result.totalDocuments).toBe(4);
    expect(result.flagCount).toBe(2);
    expect(result.flagRate).toBe(0.5);
    // z-score = (0.5 - 0.1) / 0.05 = 8.0
    expect(result.flagRateZScore).toBeCloseTo(8.0);
  });

  it('computes concern distribution from non-audit Pass 2 results', () => {
    const pass1 = [makePass1('a', true), makePass1('b', true), makePass1('c', true)];
    const pass2 = [
      makePass2('a', 'routine'),
      makePass2('b', 'potentially_concerning'),
      makePass2('c', 'clearly_concerning'),
    ];

    const result = computeAIAssessmentSummary(pass1, pass2, 0, 0.05, 'm1', 'm2');

    expect(result.concernDistribution.routine).toBe(1);
    expect(result.concernDistribution.potentiallyConcerning).toBe(1);
    expect(result.concernDistribution.clearlyConcerning).toBe(1);
    expect(result.concernRate).toBeCloseTo(2 / 3);
  });

  it('separates audit samples from concern distribution', () => {
    const pass1 = [makePass1('a', true), makePass1('b', false)];
    const pass2 = [
      makePass2('a', 'routine'),
      makePass2('b', 'potentially_concerning', true), // audit sample
    ];

    const result = computeAIAssessmentSummary(pass1, pass2, 0, 0.05, 'm1', 'm2');

    // Only non-audit Pass 2 counts for concern distribution
    expect(result.concernDistribution.routine).toBe(1);
    expect(result.concernDistribution.potentiallyConcerning).toBe(0);
    expect(result.concernRate).toBe(0);
    // Audit sample false negative
    expect(result.auditSample.sampled).toBe(1);
    expect(result.auditSample.falseNegatives).toBe(1);
    expect(result.auditSample.falseNegativeRate).toBe(1);
  });

  it('handles zero documents', () => {
    const result = computeAIAssessmentSummary([], [], 0, 0.05, 'm1', 'm2');
    expect(result.totalDocuments).toBe(0);
    expect(result.flagRate).toBe(0);
    expect(result.flagRateZScore).toBe(0);
    expect(result.concernRate).toBe(0);
  });

  it('handles all documents flagged', () => {
    const pass1 = [makePass1('a', true), makePass1('b', true)];
    const pass2 = [makePass2('a', 'novel_not_concerning'), makePass2('b', 'novel_not_concerning')];

    const result = computeAIAssessmentSummary(pass1, pass2, 0, 0.05, 'm1', 'm2');
    expect(result.flagRate).toBe(1);
    expect(result.concernDistribution.novelNotConcerning).toBe(2);
    expect(result.concernRate).toBe(0);
  });

  it('handles none flagged', () => {
    const pass1 = [makePass1('a', false), makePass1('b', false)];

    const result = computeAIAssessmentSummary(pass1, [], 0.1, 0.05, 'm1', 'm2');
    expect(result.flagCount).toBe(0);
    expect(result.flagRate).toBe(0);
    expect(result.concernRate).toBe(0);
  });

  it('handles zero baseline stddev', () => {
    const pass1 = [makePass1('a', true)];
    const pass2 = [makePass2('a', 'routine')];

    const result = computeAIAssessmentSummary(pass1, pass2, 0, 0, 'm1', 'm2');
    // When stddev=0, z-score uses fallback: |value - mean| * 10
    expect(result.flagRateZScore).toBe(10);
  });

  it('includes model names', () => {
    const result = computeAIAssessmentSummary([], [], 0, 0, 'gpt-4o-mini', 'claude-sonnet');
    expect(result.pass1Model).toBe('gpt-4o-mini');
    expect(result.pass2Model).toBe('claude-sonnet');
  });
});
