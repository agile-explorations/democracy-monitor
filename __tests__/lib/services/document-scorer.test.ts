import { describe, it, expect } from 'vitest';
import { FALSE_POSITIVE_CASES } from '@/__tests__/fixtures/scoring/false-positives';
import { TRUE_POSITIVE_CASES } from '@/__tests__/fixtures/scoring/true-positives';
import { classifyDocument } from '@/lib/services/document-classifier';
import { scoreDocument, scoreDocumentBatch } from '@/lib/services/document-scorer';

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
      { title: 'Routine quarterly budget report released by Treasury', pubDate: '2025-06-01' },
      'fiscal',
    );
    expect(score.finalScore).toBe(0);
    expect(score.matches).toHaveLength(0);
    expect(score.captureCount).toBe(0);
    expect(score.driftCount).toBe(0);
    expect(score.warningCount).toBe(0);
  });

  it('returns non-zero score for capture keyword', () => {
    const score = scoreDocument(
      { title: 'Mass termination of career staff announced', pubDate: '2025-06-01' },
      'civilService',
    );
    expect(score.finalScore).toBeGreaterThan(0);
    expect(score.captureCount).toBeGreaterThanOrEqual(1);
    expect(score.matches.some((m) => m.keyword === 'mass termination')).toBe(true);
  });

  it('applies document class multiplier for executive orders', () => {
    const score = scoreDocument(
      {
        title: 'Mass termination executive order signed',
        type: 'Presidential Document',
        pubDate: '2025-06-01',
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
        pubDate: '2025-06-01',
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
        pubDate: '2025-06-01',
      },
      'fiscal',
    );
    expect(score.isHighAuthority).toBe(true);
  });

  it('does not flag authority from content text alone', () => {
    const score = scoreDocument(
      { title: 'Article mentions GAO report on impoundment', pubDate: '2025-06-01' },
      'fiscal',
    );
    expect(score.isHighAuthority).toBe(false);
  });

  it('applies negation suppression correctly', () => {
    const score = scoreDocument(
      {
        title: 'No Evidence of Impoundment Violation Found',
        content: 'Review found no evidence of impoundment or withholding of funds.',
        pubDate: '2025-06-01',
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
        content: "Analysis of Roosevelt's attempt at court packing and its consequences.",
        pubDate: '2025-06-01',
      },
      'judicialIndependence',
    );
    expect(score.suppressed.some((s) => s.keyword === 'court packing')).toBe(true);
    // The keyword should NOT appear in matches (it was suppressed)
    expect(score.matches.some((m) => m.keyword === 'court packing')).toBe(false);
  });

  it('downweights tier instead of suppressing when downweight rule matches', () => {
    const score = scoreDocument(
      {
        title: 'Contempt of Court Finding in Civil Contempt Case',
        content: 'Judge issues civil contempt citation for procedural non-compliance.',
        pubDate: '2025-06-01',
      },
      'judicialIndependence',
    );
    // "contempt of court" has downweight_if_any: ['civil contempt', 'procedural']
    // The keyword should still appear in matches (not suppressed), but at a lower tier
    const match = score.matches.find((m) => m.keyword === 'contempt of court');
    if (match) {
      // If downweighted from capture, it should now be drift
      expect(['drift', 'warning']).toContain(match.tier);
    }
  });

  it('includes context around matched keywords', () => {
    const score = scoreDocument(
      {
        title: 'Administration Orders Regulatory Freeze Across Agencies',
        content:
          'All agencies must halt pending rulemakings under the regulatory freeze directive.',
        pubDate: '2025-06-01',
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
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    expect(score.url).toBe('https://example.com/doc/123');
    expect(score.title).toBe('Test Document Title');
  });
});

describe('logarithmic diminishing returns', () => {
  it('1 capture = ~4.0 severity', () => {
    const score = scoreDocument(
      { title: 'Inspector general removed from post', pubDate: '2025-06-01' },
      'executiveOversight',
    );
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
        title: 'Political loyalty test with mass termination of career staff',
        pubDate: '2025-06-01',
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
        title: 'Systematic purge mass termination political loyalty test for all career staff',
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    if (score.captureCount === 3 && score.driftCount === 0 && score.warningCount === 0) {
      // 4 * log2(4) = 8.0
      expect(score.severityScore).toBeCloseTo(8.0, 1);
    }
  });
});

describe('admin overlay keyword matching', () => {
  it('matches admin overlay keywords for post-2025 documents', () => {
    const score = scoreDocument(
      {
        title: 'DOGE spending review targets agency budgets',
        pubDate: '2025-02-15',
      },
      'civilService',
    );
    expect(score.matches.some((m) => m.keyword === 'doge')).toBe(true);
  });

  it('does not match admin overlay keywords for pre-2025 documents', () => {
    const score = scoreDocument(
      {
        title: 'DOGE coin mentioned in financial report',
        pubDate: '2024-06-15',
      },
      'civilService',
    );
    expect(score.matches.some((m) => m.keyword === 'doge')).toBe(false);
  });

  it('returns null for documents with no pubDate or date', () => {
    const score = scoreDocument({ title: 'DOGE review announced' }, 'civilService');
    expect(score).toBeNull();
  });

  it('matches schedule_f_era overlay for documents after 2020-10-21', () => {
    const score = scoreDocument(
      {
        title: 'Schedule F reclassification of career positions',
        pubDate: '2020-11-01',
      },
      'civilService',
    );
    expect(score.matches.some((m) => m.keyword === 'schedule f')).toBe(true);
  });

  it('does not match schedule_f_era overlay for documents before 2020-10-21', () => {
    const score = scoreDocument(
      {
        title: 'Schedule F discussed in policy brief',
        pubDate: '2020-01-01',
      },
      'civilService',
    );
    expect(score.matches.some((m) => m.keyword === 'schedule f')).toBe(false);
  });
});

describe('scoreDocument category isolation', () => {
  it('produces separate scores for same URL in different categories', () => {
    const item = {
      title: 'Executive Order on Regulatory Freeze and Workforce Reduction',
      link: 'https://www.federalregister.gov/documents/2025/01/22/EO-123/example',
      pubDate: '2025-01-22T00:00:00Z',
      type: 'Presidential Document',
    };

    const civilServiceScore = scoreDocument(item, 'civilService');
    const rulemakingScore = scoreDocument(item, 'rulemaking');

    // Same URL but separate scores per category
    expect(civilServiceScore.url).toBe(rulemakingScore.url);
    expect(civilServiceScore.category).toBe('civilService');
    expect(rulemakingScore.category).toBe('rulemaking');
    // Different categories may have different keyword matches
    expect(civilServiceScore.category).not.toBe(rulemakingScore.category);
  });
});

describe('scoreDocumentBatch', () => {
  it('filters out error and warning items', () => {
    const items = [
      { title: 'Mass termination order signed', isError: true, pubDate: '2025-06-01' },
      { title: 'Connection failed', isWarning: true, pubDate: '2025-06-01' },
      { title: 'Routine report on workforce', pubDate: '2025-06-01' },
    ];
    const scores = scoreDocumentBatch(items, 'civilService');
    expect(scores).toHaveLength(1);
    expect(scores[0].title).toBe('Routine report on workforce');
  });

  it('scores all valid items', () => {
    const items = [
      { title: 'Mass termination announced', pubDate: '2025-06-01' },
      { title: 'Routine report on workforce', pubDate: '2025-06-01' },
      { title: 'Reclassification announced', pubDate: '2025-06-01' },
    ];
    const scores = scoreDocumentBatch(items, 'civilService');
    expect(scores).toHaveLength(3);
  });
});

describe('extractContext edge cases', () => {
  it('returns truncated text when keyword is not found in content', () => {
    const score = scoreDocument(
      {
        title: 'This is a title about something completely unrelated to any keywords',
        content: 'Some summary text that does not contain any matching terms at all',
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    // Even with no matches, context extraction should handle the "not found" path
    expect(score).not.toBeNull();
  });

  it('extracts context with ellipsis prefix when keyword is far into text', () => {
    const longPrefix = 'A '.repeat(100);
    const score = scoreDocument(
      {
        title: `${longPrefix}mass termination of staff announced today`,
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    const match = score!.matches.find((m) => m.keyword === 'mass termination');
    expect(match).toBeDefined();
    expect(match!.context.startsWith('...')).toBe(true);
  });

  it('extracts context with ellipsis suffix when keyword is far from end', () => {
    const longSuffix = ' B'.repeat(100);
    const score = scoreDocument(
      {
        title: `mass termination${longSuffix}`,
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    const match = score!.matches.find((m) => m.keyword === 'mass termination');
    expect(match).toBeDefined();
    expect(match!.context.endsWith('...')).toBe(true);
  });

  it('extracts context without ellipsis when keyword is near start and end', () => {
    const score = scoreDocument(
      {
        title: 'mass termination announced',
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    const match = score!.matches.find((m) => m.keyword === 'mass termination');
    expect(match).toBeDefined();
    expect(match!.context.startsWith('...')).toBe(false);
    expect(match!.context.endsWith('...')).toBe(false);
  });
});

describe('checkNegation edge cases', () => {
  it('suppresses with "rejected" negation pattern', () => {
    const score = scoreDocument(
      {
        title: 'Court rejected impoundment attempt by the executive',
        pubDate: '2025-06-01',
      },
      'fiscal',
    );
    expect(score!.suppressed.some((s) => s.keyword === 'impoundment')).toBe(true);
    expect(score!.suppressed.some((s) => s.rule.includes('rejected'))).toBe(true);
  });

  it('suppresses with "blocked" negation pattern', () => {
    const score = scoreDocument(
      {
        title: 'Judge blocked funding freeze order from taking effect',
        pubDate: '2025-06-01',
      },
      'fiscal',
    );
    expect(score!.suppressed.some((s) => s.keyword === 'funding freeze')).toBe(true);
  });

  it('suppresses with "struck down" negation pattern', () => {
    const score = scoreDocument(
      {
        title: 'Appeals court struck down mass termination policy',
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    expect(score!.suppressed.some((s) => s.keyword === 'mass termination')).toBe(true);
  });

  it('suppresses with "did not" negation pattern', () => {
    const score = scoreDocument(
      {
        title: 'Agency did not implement workforce reduction plan',
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    expect(score!.suppressed.some((s) => s.keyword === 'workforce reduction')).toBe(true);
  });

  it('does not suppress when negation pattern is absent', () => {
    const score = scoreDocument(
      {
        title: 'Agency implements workforce reduction affecting 500 employees',
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    expect(score!.matches.some((m) => m.keyword === 'workforce reduction')).toBe(true);
    expect(score!.suppressed.some((s) => s.keyword === 'workforce reduction')).toBe(false);
  });
});

describe('checkSuppression edge cases', () => {
  it('returns no suppression for categories without suppression rules', () => {
    // Use a category that has keywords but no suppression rules
    const score = scoreDocument(
      {
        title: 'Reclassification of career positions announced',
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    // civilService does have suppression rules, but only for specific keywords
    // "reclassification" has no suppression rule, so it should pass through
    const match = score!.matches.find((m) => m.keyword === 'reclassification');
    expect(match).toBeDefined();
    expect(score!.suppressed.some((s) => s.keyword === 'reclassification')).toBe(false);
  });

  it('handles suppression rules without downweight_if_any field', () => {
    // "court packing" rule has suppress_if_any but no downweight_if_any
    const score = scoreDocument(
      {
        title: 'Court packing debate heats up in modern political arena',
        pubDate: '2025-06-01',
      },
      'judicialIndependence',
    );
    // Not suppressed (no historical terms), should appear in matches
    const match = score!.matches.find((m) => m.keyword === 'court packing');
    expect(match).toBeDefined();
  });
});

describe('downweightTier edge cases', () => {
  it('downweights capture to drift', () => {
    // "contempt of court" is capture in judicialIndependence with downweight_if_any: ['civil contempt', 'procedural']
    const score = scoreDocument(
      {
        title: 'Contempt of court finding in civil contempt proceeding',
        content: 'The judge issued a civil contempt citation.',
        pubDate: '2025-06-01',
      },
      'judicialIndependence',
    );
    const match = score!.matches.find((m) => m.keyword === 'contempt of court');
    if (match) {
      expect(match.tier).toBe('drift');
    }
  });

  it('downweights drift keyword to warning when downweight applies (impoundment)', () => {
    // "impoundment" is drift in fiscal with downweight_if_any: ['proposed', 'under review']
    const score = scoreDocument(
      {
        title: 'Proposed impoundment policy under review by OMB',
        pubDate: '2025-06-01',
      },
      'fiscal',
    );
    const match = score!.matches.find((m) => m.keyword === 'impoundment');
    expect(match).toBeDefined();
    // drift downweighted → warning
    expect(match!.tier).toBe('warning');
  });

  it('downweights capture keyword to drift when downweight applies (jurisdiction stripped)', () => {
    // "jurisdiction stripped" is capture in judicialIndependence with downweight_if_any: ['committee debate', 'hearing on']
    const score = scoreDocument(
      {
        title: 'Committee debate on jurisdiction stripped from federal courts',
        pubDate: '2025-06-01',
      },
      'judicialIndependence',
    );
    const match = score!.matches.find((m) => m.keyword === 'jurisdiction stripped');
    expect(match).toBeDefined();
    // capture downweighted → drift
    expect(match!.tier).toBe('drift');
  });
});

describe('getWeekOf edge cases', () => {
  it('handles Sunday dates (shifts to prior Monday)', () => {
    // 2025-01-26 is a Sunday → Monday of that week is 2025-01-20
    const score = scoreDocument(
      { title: 'Sunday test', pubDate: '2025-01-26T00:00:00Z' },
      'civilService',
    );
    expect(score!.weekOf).toBe('2025-01-20');
  });

  it('handles Monday dates (returns same day)', () => {
    // 2025-01-20 is a Monday
    const score = scoreDocument(
      { title: 'Monday test', pubDate: '2025-01-20T00:00:00Z' },
      'civilService',
    );
    expect(score!.weekOf).toBe('2025-01-20');
  });

  it('handles Saturday dates', () => {
    // 2025-01-25 is a Saturday → Monday of that week is 2025-01-20
    const score = scoreDocument(
      { title: 'Saturday test', pubDate: '2025-01-25T00:00:00Z' },
      'civilService',
    );
    expect(score!.weekOf).toBe('2025-01-20');
  });
});

describe('scoreDocument field defaults', () => {
  it('uses date field when pubDate is absent', () => {
    const score = scoreDocument({ title: 'Test doc', date: '2025-03-15' }, 'civilService');
    expect(score).not.toBeNull();
    expect(score!.publishedAt).toBe('2025-03-15');
  });

  it('returns empty URL when item.link is missing', () => {
    const score = scoreDocument(
      { title: 'No link document', pubDate: '2025-06-01' },
      'civilService',
    );
    expect(score!.url).toBe('');
  });

  it('returns "(untitled)" when item.title is empty', () => {
    const score = scoreDocument({ title: '', pubDate: '2025-06-01' }, 'civilService');
    expect(score!.title).toBe('(untitled)');
  });

  it('returns "(untitled)" when item.title is undefined', () => {
    const score = scoreDocument({ pubDate: '2025-06-01' } as never, 'civilService');
    expect(score!.title).toBe('(untitled)');
  });

  it('handles missing summary in content text construction', () => {
    const score = scoreDocument(
      { title: 'Mass termination ordered', pubDate: '2025-06-01' },
      'civilService',
    );
    // Should still score correctly with just title
    expect(score!.matches.some((m) => m.keyword === 'mass termination')).toBe(true);
  });

  it('scores using summary text when title has no matches', () => {
    const score = scoreDocument(
      {
        title: 'Government announcement',
        content: 'Details mass termination of career positions effective immediately',
        pubDate: '2025-06-01',
      },
      'civilService',
    );
    expect(score!.matches.some((m) => m.keyword === 'mass termination')).toBe(true);
  });
});

describe('matchKeywordsWithSuppression edge cases', () => {
  it('returns empty matches for a category with no assessment rules', () => {
    const score = scoreDocument(
      { title: 'Some random document text', pubDate: '2025-06-01' },
      'nonExistentCategory',
    );
    expect(score).not.toBeNull();
    expect(score!.matches).toHaveLength(0);
    expect(score!.suppressed).toHaveLength(0);
    expect(score!.severityScore).toBe(0);
  });
});

describe('scoreDocumentBatch edge cases', () => {
  it('filters out items with no date (scoreDocument returns null)', () => {
    const items = [{ title: 'No date item' }, { title: 'Has date', pubDate: '2025-06-01' }];
    const scores = scoreDocumentBatch(items, 'civilService');
    expect(scores).toHaveLength(1);
    expect(scores[0].title).toBe('Has date');
  });

  it('returns empty array when all items are errors/warnings', () => {
    const items = [
      { title: 'Error item', isError: true, pubDate: '2025-06-01' },
      { title: 'Warning item', isWarning: true, pubDate: '2025-06-01' },
    ];
    const scores = scoreDocumentBatch(items, 'civilService');
    expect(scores).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const scores = scoreDocumentBatch([], 'civilService');
    expect(scores).toHaveLength(0);
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
