import { describe, it, expect } from 'vitest';
import {
  ReviewDecisionSchema,
  ReviewDecisionsFileSchema,
  validateDecisionsComplete,
} from '@/lib/seed/review-decisions';

describe('ReviewDecisionSchema', () => {
  it('accepts a valid approve decision', () => {
    const result = ReviewDecisionSchema.safeParse({
      id: 'courts--2024-06-01--downgrade--0',
      decision: 'approve',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid override with overrideStatus', () => {
    const result = ReviewDecisionSchema.safeParse({
      id: 'courts--2024-06-01--downgrade--0',
      decision: 'override',
      overrideStatus: 'Warning',
      notes: 'Reviewed manually',
    });
    expect(result.success).toBe(true);
  });

  it('rejects override without overrideStatus', () => {
    const result = ReviewDecisionSchema.safeParse({
      id: 'courts--2024-06-01--downgrade--0',
      decision: 'override',
    });
    expect(result.success).toBe(false);
  });

  it('accepts pending without extra fields', () => {
    const result = ReviewDecisionSchema.safeParse({ id: 'x', decision: 'pending' });
    expect(result.success).toBe(true);
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
  it('returns IDs of pending decisions', () => {
    const decisions = [
      { id: 'a', decision: 'approve' as const },
      { id: 'b', decision: 'pending' as const },
      { id: 'c', decision: 'override' as const, overrideStatus: 'Warning' as const },
      { id: 'd', decision: 'pending' as const },
    ];
    expect(validateDecisionsComplete(decisions)).toEqual(['b', 'd']);
  });

  it('returns empty array when all decided', () => {
    const decisions = [
      { id: 'a', decision: 'approve' as const },
      { id: 'b', decision: 'override' as const, overrideStatus: 'Stable' as const },
    ];
    expect(validateDecisionsComplete(decisions)).toEqual([]);
  });
});
