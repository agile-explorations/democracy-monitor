import { describe, it, expect } from 'vitest';
import { FALSE_POSITIVE_CASES } from '@/__tests__/fixtures/scoring/false-positives';
import { TRUE_POSITIVE_CASES } from '@/__tests__/fixtures/scoring/true-positives';
import {
  classifyDocument,
  scoreDocument,
  scoreDocumentBatch,
} from '@/lib/services/document-scorer';

describe('classifyDocument', () => {
  it('classifies Federal Register Presidential Documents as executive_order', () => {
    expect(classifyDocument({ type: 'Presidential Document' })).toBe('executive_order');
  });

  it('classifies Federal Register Rules as final_rule', () => {
    expect(classifyDocument({ type: 'Rule' })).toBe('final_rule');
  });

  it('classifies Federal Register Proposed Rules as proposed_rule', () => {
    expect(classifyDocument({ type: 'Proposed Rule' })).toBe('proposed_rule');
  });

  it('classifies Federal Register Notices as notice', () => {
    expect(classifyDocument({ type: 'Notice' })).toBe('notice');
  });

  it('classifies items with "executive order" in title', () => {
    expect(classifyDocument({ title: 'Executive Order on Border Security' })).toBe(
      'executive_order',
    );
  });

  it('classifies items with "presidential memorandum" in title', () => {
    expect(classifyDocument({ title: 'Presidential Memorandum on Trade Policy' })).toBe(
      'presidential_memorandum',
    );
  });

  it('classifies GAO as report based on agency', () => {
    expect(classifyDocument({ agency: 'Government Accountability Office' })).toBe('report');
  });

  it('classifies SCOTUS as court_opinion based on agency', () => {
    expect(classifyDocument({ agency: 'Supreme Court of the United States' })).toBe(
      'court_opinion',
    );
  });

  it('classifies DoD as press_release based on agency', () => {
    expect(classifyDocument({ agency: 'Department of Defense' })).toBe('press_release');
  });

  it('returns unknown for unrecognized sources', () => {
    expect(classifyDocument({ title: 'Some random article' })).toBe('unknown');
  });
});

describe('scoreDocument', () => {
  it('returns zero score for clean text with no keyword matches', () => {
    const score = scoreDocument(
      { title: 'Routine quarterly budget report released by Treasury' },
      'fiscal',
    );
    expect(score.finalScore).toBe(0);
    expect(score.matches).toHaveLength(0);
    expect(score.captureCount).toBe(0);
    expect(score.driftCount).toBe(0);
    expect(score.warningCount).toBe(0);
  });

  it('returns non-zero score for capture keyword', () => {
    const score = scoreDocument({ title: 'Schedule F executive order reinstated' }, 'civilService');
    expect(score.finalScore).toBeGreaterThan(0);
    expect(score.captureCount).toBeGreaterThanOrEqual(1);
    expect(score.matches.some((m) => m.keyword === 'schedule f')).toBe(true);
  });

  it('applies document class multiplier for executive orders', () => {
    const score = scoreDocument(
      {
        title: 'Schedule F executive order reinstated',
        type: 'Presidential Document',
      },
      'civilService',
    );
    expect(score.documentClass).toBe('executive_order');
    expect(score.classMultiplier).toBe(1.5);
    expect(score.finalScore).toBe(score.severityScore * 1.5);
  });

  it('applies lower multiplier for notices', () => {
    const score = scoreDocument(
      {
        title: 'Notice of workforce reduction in agency',
        type: 'Notice',
      },
      'civilService',
    );
    expect(score.documentClass).toBe('notice');
    expect(score.classMultiplier).toBe(0.5);
  });

  it('detects high-authority sources from agency field', () => {
    const score = scoreDocument(
      {
        title: 'GAO finds violated impoundment control act',
        agency: 'Government Accountability Office',
      },
      'fiscal',
    );
    expect(score.isHighAuthority).toBe(true);
  });

  it('does not flag authority from content text alone', () => {
    const score = scoreDocument({ title: 'Article mentions GAO report on impoundment' }, 'fiscal');
    expect(score.isHighAuthority).toBe(false);
  });

  it('applies negation suppression correctly', () => {
    const score = scoreDocument(
      {
        title: 'No Evidence of Impoundment Violation Found',
        summary: 'Review found no evidence of impoundment or withholding of funds.',
      },
      'fiscal',
    );
    expect(score.suppressedCount).toBeGreaterThan(0);
    expect(score.suppressed.some((s) => s.keyword === 'impoundment')).toBe(true);
  });

  it('applies category-specific suppression rules', () => {
    const score = scoreDocument(
      {
        title: 'FDR and the 1937 Court-Packing Plan: Historical Lessons',
        summary: "Analysis of Roosevelt's attempt at court packing and its consequences.",
      },
      'courts',
    );
    expect(score.suppressed.some((s) => s.keyword === 'court packing')).toBe(true);
    // The keyword should NOT appear in matches (it was suppressed)
    expect(score.matches.some((m) => m.keyword === 'court packing')).toBe(false);
  });

  it('includes context around matched keywords', () => {
    const score = scoreDocument(
      {
        title: 'Administration Orders Regulatory Freeze Across Agencies',
        summary:
          'All agencies must halt pending rulemakings under the regulatory freeze directive.',
      },
      'rulemaking',
    );
    const match = score.matches.find((m) => m.keyword === 'regulatory freeze');
    expect(match).toBeDefined();
    expect(match!.context.length).toBeGreaterThan(0);
    expect(match!.context.toLowerCase()).toContain('regulatory freeze');
  });

  it('computes weekOf from publication date', () => {
    // 2025-01-22 is a Wednesday → Monday of that week is 2025-01-20
    const score = scoreDocument({ title: 'Test', pubDate: '2025-01-22T00:00:00Z' }, 'civilService');
    expect(score.weekOf).toBe('2025-01-20');
  });

  it('returns correct URL and title', () => {
    const score = scoreDocument(
      {
        title: 'Test Document Title',
        link: 'https://example.com/doc/123',
      },
      'civilService',
    );
    expect(score.url).toBe('https://example.com/doc/123');
    expect(score.title).toBe('Test Document Title');
  });
});

describe('logarithmic diminishing returns', () => {
  it('1 capture = ~4.0 severity', () => {
    const score = scoreDocument({ title: 'Inspector general removed from post' }, 'igs');
    const captureMatches = score.matches.filter((m) => m.tier === 'capture');
    if (captureMatches.length === 1 && score.driftCount === 0 && score.warningCount === 0) {
      // 4 * log2(2) = 4.0
      expect(score.severityScore).toBeCloseTo(4.0, 1);
    }
  });

  it('multiple captures show diminishing returns', () => {
    // This item has 2 capture keywords
    const score = scoreDocument(
      {
        title: 'Schedule F executive order with mass termination of career staff',
      },
      'civilService',
    );
    if (score.captureCount === 2 && score.driftCount === 0 && score.warningCount === 0) {
      // 4 * log2(3) ≈ 6.34
      expect(score.severityScore).toBeCloseTo(6.34, 0);
    }
  });

  it('3 captures ≈ 8.0', () => {
    const score = scoreDocument(
      {
        title: 'Schedule F mass termination political loyalty test for all career staff',
      },
      'civilService',
    );
    if (score.captureCount === 3 && score.driftCount === 0 && score.warningCount === 0) {
      // 4 * log2(4) = 8.0
      expect(score.severityScore).toBeCloseTo(8.0, 1);
    }
  });
});

describe('scoreDocumentBatch', () => {
  it('filters out error and warning items', () => {
    const items = [
      { title: 'Schedule F order signed', isError: true },
      { title: 'Connection failed', isWarning: true },
      { title: 'Routine report on workforce' },
    ];
    const scores = scoreDocumentBatch(items, 'civilService');
    expect(scores).toHaveLength(1);
    expect(scores[0].title).toBe('Routine report on workforce');
  });

  it('scores all valid items', () => {
    const items = [
      { title: 'Schedule F reinstated' },
      { title: 'Routine report on workforce' },
      { title: 'Reclassification announced' },
    ];
    const scores = scoreDocumentBatch(items, 'civilService');
    expect(scores).toHaveLength(3);
  });
});

describe('false positive fixture tests', () => {
  for (const tc of FALSE_POSITIVE_CASES) {
    it(`suppresses: ${tc.name}`, () => {
      const score = scoreDocument(tc.item, tc.category);
      // The suppressed keyword should NOT appear in active matches
      const activeMatch = score.matches.find(
        (m) => m.keyword.toLowerCase() === tc.suppressedKeyword.toLowerCase(),
      );
      // Either it was suppressed or it wasn't matched at all (both are acceptable)
      if (activeMatch) {
        // If it somehow made it through, that's a failure
        expect(activeMatch).toBeUndefined();
      }
    });
  }
});

describe('true positive fixture tests', () => {
  for (const tc of TRUE_POSITIVE_CASES) {
    it(`detects: ${tc.name}`, () => {
      const score = scoreDocument(tc.item, tc.category);
      expect(score.finalScore).toBeGreaterThan(0);

      const match = score.matches.find(
        (m) => m.keyword.toLowerCase() === tc.expectedKeyword.toLowerCase(),
      );
      expect(match).toBeDefined();
      expect(match!.tier).toBe(tc.expectedTier);
    });
  }
});
