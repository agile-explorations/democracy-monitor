import { describe, it, expect } from 'vitest';
import {
  ReviewDecisionSchema,
  ReviewDecisionsFileSchema,
  ReviewFeedbackSchema,
  validateDecisionsComplete,
} from '@/lib/seed/review-decisions';

describe('ReviewDecisionSchema', () => {
  it('accepts a valid approve decision', () => {
    const result = ReviewDecisionSchema.safeParse({
      id: 'courts--2024-06-01',
      decision: 'approve',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid override with finalStatus', () => {
    const result = ReviewDecisionSchema.safeParse({
      id: 'courts--2024-06-01',
      decision: 'override',
      finalStatus: 'Warning',
      reasoning: 'Reviewed manually',
    });
    expect(result.success).toBe(true);
  });

  it('rejects override without finalStatus', () => {
    const result = ReviewDecisionSchema.safeParse({
      id: 'courts--2024-06-01',
      decision: 'override',
    });
    expect(result.success).toBe(false);
  });

  it('accepts skip decision', () => {
    const result = ReviewDecisionSchema.safeParse({
      id: 'courts--2024-06-01',
      decision: 'skip',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid decision values', () => {
    const result = ReviewDecisionSchema.safeParse({
      id: 'x',
      decision: 'pending',
    });
    expect(result.success).toBe(false);
  });

  it('accepts decision with feedback', () => {
    const result = ReviewDecisionSchema.safeParse({
      id: 'courts--2024-06-01',
      decision: 'approve',
      feedback: {
        falsePositiveKeywords: ['emergency'],
        missingKeywords: ['tribunal'],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('ReviewFeedbackSchema', () => {
  it('accepts all four feedback sub-fields', () => {
    const result = ReviewFeedbackSchema.safeParse({
      falsePositiveKeywords: ['emergency'],
      missingKeywords: ['tribunal'],
      suppressionSuggestions: ['routine weather emergency'],
      tierChanges: [
        { keyword: 'deploy', currentTier: 'warning', suggestedTier: 'drift', reason: 'Often real' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = ReviewFeedbackSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates tier change requires keyword and suggestedTier', () => {
    const result = ReviewFeedbackSchema.safeParse({
      tierChanges: [{ currentTier: 'warning' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('ReviewDecisionsFileSchema', () => {
  it('validates a complete file structure', () => {
    const file = {
      metadata: { generatedAt: '2024-06-01T00:00:00Z', totalItems: 1 },
      decisions: [{ id: 'a', decision: 'approve' }],
    };
    expect(ReviewDecisionsFileSchema.safeParse(file).success).toBe(true);
  });

  it('rejects missing metadata', () => {
    const file = { decisions: [{ id: 'a', decision: 'approve' }] };
    expect(ReviewDecisionsFileSchema.safeParse(file).success).toBe(false);
  });
});

describe('validateDecisionsComplete', () => {
  it('returns IDs of skipped decisions', () => {
    const decisions = [
      { id: 'a', decision: 'approve' as const },
      { id: 'b', decision: 'skip' as const },
      { id: 'c', decision: 'override' as const, finalStatus: 'Warning' as const },
      { id: 'd', decision: 'skip' as const },
    ];
    expect(validateDecisionsComplete(decisions)).toEqual(['b', 'd']);
  });

  it('returns empty array when all decided', () => {
    const decisions = [
      { id: 'a', decision: 'approve' as const },
      { id: 'b', decision: 'override' as const, finalStatus: 'Stable' as const },
    ];
    expect(validateDecisionsComplete(decisions)).toEqual([]);
  });
});
