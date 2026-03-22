import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  selectAuditSample,
  computeAIAssessmentSummary,
  assessPass1,
  assessPass2,
} from '@/lib/services/document-review-assessment-service';
import type { Pass1Result, Pass2Result } from '@/lib/services/document-review-assessment-service';
import type { AIProvider, ContentItem } from '@/lib/types';

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

  it('z-score is zero when value equals mean and stddev is zero', () => {
    // All flagged, baseline=1.0, stddev=0 → value equals mean
    const pass1 = [makePass1('a', true)];
    const pass2 = [makePass2('a', 'routine')];

    const result = computeAIAssessmentSummary(pass1, pass2, 1.0, 0, 'm1', 'm2');
    expect(result.flagRateZScore).toBe(0);
  });

  it('audit sample with no false negatives reports zero rate', () => {
    const pass1 = [makePass1('a', true), makePass1('b', false)];
    const pass2 = [
      makePass2('a', 'routine'),
      makePass2('b', 'routine', true), // audit sample, not concerning
    ];

    const result = computeAIAssessmentSummary(pass1, pass2, 0.1, 0.05, 'm1', 'm2');
    expect(result.auditSample.sampled).toBe(1);
    expect(result.auditSample.falseNegatives).toBe(0);
    expect(result.auditSample.falseNegativeRate).toBe(0);
  });

  it('audit clearly_concerning counts as false negative', () => {
    const pass1 = [makePass1('a', false)];
    const pass2 = [makePass2('a', 'clearly_concerning', true)];

    const result = computeAIAssessmentSummary(pass1, pass2, 0, 0.05, 'm1', 'm2');
    expect(result.auditSample.falseNegatives).toBe(1);
  });

  it('concern rate counts both potentially and clearly concerning', () => {
    const pass1 = [
      makePass1('a', true),
      makePass1('b', true),
      makePass1('c', true),
      makePass1('d', true),
    ];
    const pass2 = [
      makePass2('a', 'routine'),
      makePass2('b', 'potentially_concerning'),
      makePass2('c', 'clearly_concerning'),
      makePass2('d', 'novel_not_concerning'),
    ];

    const result = computeAIAssessmentSummary(pass1, pass2, 0, 0.05, 'm1', 'm2');
    expect(result.concernRate).toBeCloseTo(0.5); // 2 of 4
  });

  it('no non-audit pass2 results yields zero concern rate', () => {
    const pass1 = [makePass1('a', false)];
    const pass2 = [makePass2('a', 'potentially_concerning', true)]; // only audit

    const result = computeAIAssessmentSummary(pass1, pass2, 0, 0.05, 'm1', 'm2');
    expect(result.concernRate).toBe(0);
    expect(result.concernDistribution.routine).toBe(0);
  });
});

describe('assessPass1', () => {
  function makeDoc(overrides: Partial<ContentItem> = {}): ContentItem {
    return {
      title: 'Test Document',
      summary: 'This is a test summary',
      link: 'https://example.com/doc',
      pubDate: '2025-02-01',
      agency: 'DOJ',
      type: 'federal_register',
      ...overrides,
    };
  }

  function makeProvider(content: string): AIProvider {
    return {
      name: 'openai',
      complete: vi.fn().mockResolvedValue({
        content,
        model: 'gpt-4o-mini',
        tokensUsed: { input: 100, output: 50 },
        latencyMs: 200,
      }),
      isAvailable: vi.fn().mockReturnValue(true),
    };
  }

  it('returns null when AI call throws', async () => {
    const doc = makeDoc();
    const provider: AIProvider = {
      name: 'openai',
      complete: vi.fn().mockRejectedValue(new Error('API timeout')),
      isAvailable: vi.fn().mockReturnValue(true),
    };

    const result = await assessPass1(doc, 'Test category', provider);
    expect(result).toBeNull();
  });

  it('returns null when response cannot be parsed', async () => {
    const doc = makeDoc();
    const provider = makeProvider('not valid json');

    const result = await assessPass1(doc, 'Test category', provider);
    expect(result).toBeNull();
  });

  it('returns parsed result for valid response', async () => {
    const doc = makeDoc();
    const validJson = JSON.stringify({
      relevant: true,
      confidence: 0.9,
      signals: ['signal1'],
      erosionType: 'operational_hollowing',
    });
    const provider = makeProvider(validJson);

    const result = await assessPass1(doc, 'Test category', provider);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://example.com/doc');
    expect(result!.response.relevant).toBe(true);
    expect(result!.meta.model).toBe('gpt-4o-mini');
    expect(result!.meta.provider).toBe('openai');
  });

  it('uses title as URL fallback when link is missing', async () => {
    const doc = makeDoc({ link: undefined });
    const validJson = JSON.stringify({
      relevant: false,
      confidence: 0.8,
      signals: [],
      erosionType: 'routine',
    });
    const provider = makeProvider(validJson);

    const result = await assessPass1(doc, 'Test category', provider);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('Test Document');
  });

  it('uses "unknown" as URL fallback when both link and title are missing', async () => {
    const doc = makeDoc({ link: undefined, title: undefined });
    const validJson = JSON.stringify({
      relevant: false,
      confidence: 0.5,
      signals: [],
      erosionType: 'routine',
    });
    const provider = makeProvider(validJson);

    const result = await assessPass1(doc, 'Test category', provider);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('unknown');
  });
});

describe('assessPass2', () => {
  function makeDoc(overrides: Partial<ContentItem> = {}): ContentItem {
    return {
      title: 'Test Document',
      summary: 'This is a test summary',
      link: 'https://example.com/doc',
      pubDate: '2025-02-01',
      agency: 'DOJ',
      type: 'federal_register',
      ...overrides,
    };
  }

  function makeProvider(content: string): AIProvider {
    return {
      name: 'anthropic',
      complete: vi.fn().mockResolvedValue({
        content,
        model: 'claude-sonnet',
        tokensUsed: { input: 200, output: 100 },
        latencyMs: 500,
      }),
      isAvailable: vi.fn().mockReturnValue(true),
    };
  }

  it('returns null when AI call throws', async () => {
    const doc = makeDoc();
    const provider: AIProvider = {
      name: 'anthropic',
      complete: vi.fn().mockRejectedValue(new Error('Rate limited')),
      isAvailable: vi.fn().mockReturnValue(true),
    };

    const result = await assessPass2(
      doc,
      ['signal'],
      'operational_hollowing',
      'Test category',
      provider,
      false,
    );
    expect(result).toBeNull();
  });

  it('returns null when response cannot be parsed', async () => {
    const doc = makeDoc();
    const provider = makeProvider('invalid json');

    const result = await assessPass2(
      doc,
      ['signal'],
      'operational_hollowing',
      'Test category',
      provider,
      false,
    );
    expect(result).toBeNull();
  });

  it('returns parsed result for valid response', async () => {
    const doc = makeDoc();
    const validJson = JSON.stringify({
      assessment: 'potentially_concerning',
      confidence: 0.85,
      reasoning: 'Reasoning text',
      comparativeContext: 'Context text',
      citedPassages: ['passage1'],
      erosionType: 'formal_override',
      counterArguments: ['counter1'],
    });
    const provider = makeProvider(validJson);

    const result = await assessPass2(
      doc,
      ['signal'],
      'operational_hollowing',
      'Test category',
      provider,
      false,
    );
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://example.com/doc');
    expect(result!.response.assessment).toBe('potentially_concerning');
    expect(result!.isAuditSample).toBe(false);
    expect(result!.meta.provider).toBe('anthropic');
  });

  it('correctly sets isAuditSample flag', async () => {
    const doc = makeDoc();
    const validJson = JSON.stringify({
      assessment: 'routine',
      confidence: 0.9,
      reasoning: 'Routine',
      comparativeContext: 'Normal',
      citedPassages: [],
      erosionType: 'routine',
      counterArguments: [],
    });
    const provider = makeProvider(validJson);

    const result = await assessPass2(doc, [], 'routine', 'Test category', provider, true);
    expect(result).not.toBeNull();
    expect(result!.isAuditSample).toBe(true);
  });

  it('uses title fallback when link is missing', async () => {
    const doc = makeDoc({ link: undefined });
    const validJson = JSON.stringify({
      assessment: 'routine',
      confidence: 0.9,
      reasoning: 'test',
      comparativeContext: 'test',
      citedPassages: [],
      erosionType: 'routine',
      counterArguments: [],
    });
    const provider = makeProvider(validJson);

    const result = await assessPass2(doc, [], 'routine', 'Test category', provider, false);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('Test Document');
  });
});
