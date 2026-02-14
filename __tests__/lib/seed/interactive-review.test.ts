import { describe, it, expect } from 'vitest';
import {
  formatItemForDisplay,
  formatDocumentLines,
  formatEvidenceLines,
  formatAiFeedbackLines,
  extractAiFeedback,
  getCategoryKeywords,
  parseStatusInput,
  buildResolveArgs,
  formatProgressSummary,
  bulkApproveAi,
} from '@/lib/seed/interactive-review';

function makeAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    category: 'courts',
    severity: 'Warning',
    message: 'AI recommends Stable vs keyword Warning',
    metadata: {
      keywordStatus: 'Warning',
      aiRecommendedStatus: 'Stable',
      aiConfidence: 0.5,
      aiReasoning: 'Looks normal',
      keywordReview: [
        { keyword: 'injunction issued', assessment: 'false_positive', reasoning: 'Routine' },
      ],
    },
    createdAt: new Date('2024-06-15'),
    ...overrides,
  };
}

describe('extractAiFeedback', () => {
  it('extracts false positive keywords from AI verdicts', () => {
    const feedback = extractAiFeedback(makeAlert());
    expect(feedback).toBeDefined();
    expect(feedback!.falsePositiveKeywords).toEqual(['injunction issued']);
  });

  it('extracts suppression suggestions from suppressionContext', () => {
    const feedback = extractAiFeedback(
      makeAlert({
        metadata: {
          keywordReview: [
            {
              keyword: 'court ordered',
              assessment: 'false_positive',
              reasoning: 'Routine admin',
              suppressionContext: 'routine administrative context',
            },
          ],
        },
      }),
    );
    expect(feedback!.suppressionSuggestions).toEqual([
      'court ordered: routine administrative context',
    ]);
  });

  it('extracts tier changes from suggestedAction', () => {
    const feedback = extractAiFeedback(
      makeAlert({
        metadata: {
          keywordReview: [
            {
              keyword: 'delayed compliance',
              assessment: 'ambiguous',
              reasoning: 'Too broad',
              suggestedAction: 'move_to_warning',
            },
          ],
        },
      }),
    );
    expect(feedback!.tierChanges).toEqual([
      {
        keyword: 'delayed compliance',
        currentTier: 'unknown',
        suggestedTier: 'warning',
        reason: 'Too broad',
      },
    ]);
  });

  it('returns undefined when no feedback-worthy verdicts exist', () => {
    const feedback = extractAiFeedback(
      makeAlert({
        metadata: {
          keywordReview: [
            { keyword: 'schedule f', assessment: 'genuine_concern', reasoning: 'Real concern' },
          ],
        },
      }),
    );
    expect(feedback).toBeUndefined();
  });

  it('returns undefined when keywordReview is empty', () => {
    expect(extractAiFeedback(makeAlert({ metadata: {} }))).toBeUndefined();
    expect(extractAiFeedback(makeAlert({ metadata: { keywordReview: [] } }))).toBeUndefined();
  });

  it('filters out AI-hallucinated keywords not in the category dictionary', () => {
    const feedback = extractAiFeedback(
      makeAlert({
        metadata: {
          keywordReview: [
            { keyword: 'injunction issued', assessment: 'false_positive', reasoning: 'Routine' },
            { keyword: 'drift', assessment: 'false_positive', reasoning: 'Not a real keyword' },
            { keyword: 'courts', assessment: 'false_positive', reasoning: 'Category name' },
          ],
        },
      }),
    );
    expect(feedback!.falsePositiveKeywords).toEqual(['injunction issued']);
  });

  it('ignores suggestedAction=keep', () => {
    const feedback = extractAiFeedback(
      makeAlert({
        metadata: {
          keywordReview: [
            {
              keyword: 'schedule f',
              assessment: 'genuine_concern',
              reasoning: 'Real',
              suggestedAction: 'keep',
            },
          ],
        },
      }),
    );
    expect(feedback).toBeUndefined();
  });
});

describe('formatAiFeedbackLines', () => {
  it('formats all feedback types', () => {
    const lines = formatAiFeedbackLines({
      falsePositiveKeywords: ['emergency', 'routine'],
      suppressionSuggestions: ['emergency: admin context'],
      tierChanges: [{ keyword: 'restructuring', currentTier: 'drift', suggestedTier: 'warning' }],
    });
    expect(lines[0]).toBe('  AI Keyword Suggestions:');
    expect(lines).toContainEqual(expect.stringContaining('emergency, routine'));
    expect(lines).toContainEqual(expect.stringContaining('emergency: admin context'));
    expect(lines).toContainEqual(expect.stringContaining('restructuring'));
  });

  it('returns empty for undefined feedback', () => {
    expect(formatAiFeedbackLines(undefined)).toEqual([]);
  });
});

describe('formatItemForDisplay', () => {
  it('produces expected terminal output with progress', () => {
    const output = formatItemForDisplay(makeAlert(), 0, 10);
    expect(output).toContain('Review 1 of 10');
    expect(output).toContain('courts');
    expect(output).toContain('Warning');
    expect(output).toContain('Stable');
    expect(output).toContain('50%');
    expect(output).toContain('Looks normal');
  });

  it('shows keyword verdicts', () => {
    const output = formatItemForDisplay(makeAlert(), 0, 1);
    expect(output).toContain('injunction issued');
    expect(output).toContain('false_positive');
  });

  it('shows AI keyword suggestions section', () => {
    const output = formatItemForDisplay(makeAlert(), 0, 1);
    expect(output).toContain('AI Keyword Suggestions');
    expect(output).toContain('False positives: injunction issued');
  });

  it('shows suggestedAction in keyword verdicts', () => {
    const output = formatItemForDisplay(
      makeAlert({
        metadata: {
          keywordReview: [
            {
              keyword: 'delayed compliance',
              assessment: 'ambiguous',
              reasoning: 'Broad',
              suggestedAction: 'move_to_warning',
            },
          ],
        },
      }),
      0,
      1,
    );
    expect(output).toContain('[→move_to_warning]');
  });

  it('shows <none> when no keywords matched', () => {
    const output = formatItemForDisplay(makeAlert({ metadata: { keywordMatches: [] } }), 0, 1);
    expect(output).toContain('Matched Keywords: <none>');
  });

  it('shows document count and insufficient data flag', () => {
    const output = formatItemForDisplay(
      makeAlert({
        metadata: {
          keywordStatus: 'Warning',
          documentCount: 2,
          insufficientData: true,
          keywordMatches: [],
        },
      }),
      0,
      1,
    );
    expect(output).toContain('Documents:      2 (below minimum of 3)');
  });

  it('shows document count without flag when sufficient', () => {
    const output = formatItemForDisplay(
      makeAlert({
        metadata: { keywordStatus: 'Warning', documentCount: 15, keywordMatches: ['emergency'] },
      }),
      0,
      1,
    );
    expect(output).toContain('Documents:      15');
    expect(output).not.toContain('below minimum');
    expect(output).toContain('Matched Keywords: emergency');
  });

  it('handles missing metadata gracefully', () => {
    const output = formatItemForDisplay(makeAlert({ metadata: {} }), 0, 1);
    expect(output).toContain('N/A');
  });

  it('shows evidence items when available', () => {
    const output = formatItemForDisplay(
      makeAlert({
        metadata: {
          keywordStatus: 'Warning',
          aiRecommendedStatus: 'Stable',
          aiConfidence: 0.8,
          evidenceFor: [{ text: 'Schedule F reinstatement order', direction: 'concerning' }],
          evidenceAgainst: [{ text: 'Routine personnel memo', direction: 'reassuring' }],
        },
      }),
      0,
      1,
    );
    expect(output).toContain('Concerning evidence');
    expect(output).toContain('Schedule F reinstatement order');
    expect(output).toContain('Reassuring evidence');
    expect(output).toContain('Routine personnel memo');
  });
});

describe('formatDocumentLines', () => {
  it('formats documents with title, date, and URL', () => {
    const lines = formatDocumentLines({
      reviewedDocuments: [
        {
          title: 'Executive Order on Immigration',
          url: 'https://example.com/eo',
          date: '2026-01-15',
        },
        { title: 'Routine Personnel Memo' },
      ],
    });
    expect(lines[0]).toBe('  Documents reviewed:');
    expect(lines[1]).toContain('Executive Order on Immigration');
    expect(lines[1]).toContain('[2026-01-15]');
    expect(lines[1]).toContain('https://example.com/eo');
    expect(lines[2]).toContain('Routine Personnel Memo');
  });

  it('returns empty for no documents', () => {
    expect(formatDocumentLines({})).toEqual([]);
    expect(formatDocumentLines({ reviewedDocuments: [] })).toEqual([]);
  });
});

describe('formatEvidenceLines', () => {
  it('formats concerning and reassuring items', () => {
    const lines = formatEvidenceLines({
      evidenceFor: [{ text: 'Bad thing', direction: 'concerning' }],
      evidenceAgainst: [{ text: 'Good thing', direction: 'reassuring' }],
    });
    expect(lines).toContain('  Concerning evidence:');
    expect(lines).toContain('    ! Bad thing');
    expect(lines).toContain('  Reassuring evidence:');
    expect(lines).toContain('    - Good thing');
  });

  it('returns empty for no evidence', () => {
    expect(formatEvidenceLines({})).toEqual([]);
  });
});

describe('parseStatusInput', () => {
  it('maps number inputs correctly', () => {
    expect(parseStatusInput('1')).toBe('Stable');
    expect(parseStatusInput('2')).toBe('Warning');
    expect(parseStatusInput('3')).toBe('Drift');
    expect(parseStatusInput('4')).toBe('Capture');
  });

  it('maps initial-letter inputs correctly', () => {
    expect(parseStatusInput('s')).toBe('Stable');
    expect(parseStatusInput('w')).toBe('Warning');
    expect(parseStatusInput('d')).toBe('Drift');
    expect(parseStatusInput('c')).toBe('Capture');
  });

  it('maps full name inputs correctly', () => {
    expect(parseStatusInput('stable')).toBe('Stable');
    expect(parseStatusInput('Warning')).toBe('Warning');
    expect(parseStatusInput('DRIFT')).toBe('Drift');
  });

  it('returns null for invalid input', () => {
    expect(parseStatusInput('')).toBeNull();
    expect(parseStatusInput('5')).toBeNull();
    expect(parseStatusInput('invalid')).toBeNull();
  });
});

describe('buildResolveArgs', () => {
  it('approve uses AI recommended status', () => {
    const args = buildResolveArgs({ decision: 'approve' }, makeAlert(), 'reviewer');
    expect(args.alertId).toBe(1);
    expect(args.decision.finalStatus).toBe('Stable');
    expect(args.decision.decision).toBe('approve');
    expect(args.decision.reviewer).toBe('reviewer');
  });

  it('override uses provided finalStatus', () => {
    const args = buildResolveArgs(
      { decision: 'override', finalStatus: 'Drift' },
      makeAlert(),
      'reviewer',
    );
    expect(args.decision.finalStatus).toBe('Drift');
    expect(args.decision.decision).toBe('override');
  });

  it('skip uses current severity', () => {
    const args = buildResolveArgs({ decision: 'skip' }, makeAlert(), 'reviewer');
    expect(args.decision.finalStatus).toBe('Warning');
    expect(args.decision.decision).toBe('skip');
  });

  it('includes all feedback types when provided', () => {
    const args = buildResolveArgs(
      {
        decision: 'approve',
        falsePositiveKeywords: ['emergency'],
        missingKeywords: ['tribunal'],
        suppressionSuggestions: ['emergency: admin context'],
        tierChanges: [{ keyword: 'restructuring', currentTier: 'drift', suggestedTier: 'warning' }],
      },
      makeAlert(),
      'reviewer',
    );
    expect(args.decision.feedback).toEqual({
      falsePositiveKeywords: ['emergency'],
      missingKeywords: ['tribunal'],
      suppressionSuggestions: ['emergency: admin context'],
      tierChanges: [{ keyword: 'restructuring', currentTier: 'drift', suggestedTier: 'warning' }],
    });
  });

  it('omits feedback when no keywords provided', () => {
    const args = buildResolveArgs({ decision: 'approve' }, makeAlert(), 'reviewer');
    expect(args.decision.feedback).toBeUndefined();
  });
});

describe('formatProgressSummary', () => {
  it('shows correct counts', () => {
    const summary = formatProgressSummary(10, 5);
    expect(summary).toContain('Pending:  10');
    expect(summary).toContain('Resolved: 5');
    expect(summary).toContain('Total:    15');
  });
});

describe('bulkApproveAi', () => {
  it('creates approve args for all items', () => {
    const alerts = [makeAlert({ id: 1 }), makeAlert({ id: 2, category: 'military' })];
    const result = bulkApproveAi(alerts, 'bulk-reviewer');
    expect(result).toHaveLength(2);
    expect(result[0].alertId).toBe(1);
    expect(result[0].decision.decision).toBe('approve');
    expect(result[0].decision.reviewer).toBe('bulk-reviewer');
    expect(result[1].alertId).toBe(2);
  });

  it('includes AI feedback in bulk approve', () => {
    const alerts = [
      makeAlert({
        id: 1,
        metadata: {
          aiRecommendedStatus: 'Stable',
          keywordReview: [
            { keyword: 'injunction issued', assessment: 'false_positive', reasoning: 'Routine' },
          ],
        },
      }),
    ];
    const result = bulkApproveAi(alerts, 'reviewer');
    expect(result[0].decision.feedback?.falsePositiveKeywords).toEqual(['injunction issued']);
  });

  it('uses AI recommended status for each alert', () => {
    const alerts = [
      makeAlert({ id: 1, metadata: { aiRecommendedStatus: 'Stable' } }),
      makeAlert({ id: 2, metadata: { aiRecommendedStatus: 'Drift' } }),
    ];
    const result = bulkApproveAi(alerts, 'reviewer');
    expect(result[0].decision.finalStatus).toBe('Stable');
    expect(result[1].decision.finalStatus).toBe('Drift');
  });
});
