import { describe, expect, it } from 'vitest';
import { synthesizeConvergence } from '@/lib/services/concern-synthesis';
import type { AIAssessmentSummary } from '@/lib/types/structural';

function summary(over: Partial<AIAssessmentSummary>): AIAssessmentSummary {
  return {
    flagCount: 10,
    totalDocuments: 40,
    flagRate: 0.25,
    baselineFlagRate: 0.05,
    flagRateZScore: 2,
    concernDistribution: {
      routine: 10,
      novelNotConcerning: 2,
      potentiallyConcerning: 0,
      clearlyConcerning: 0,
    },
    actorConfirmations: {},
    concernRate: 0,
    auditSample: { sampled: 0, falseNegatives: 0, falseNegativeRate: 0 },
    pass1Model: 'm1',
    pass2Model: 'm2',
    ...over,
  } as AIAssessmentSummary;
}

describe('graded concern synthesis (#842)', () => {
  it('caps a discussion-only ConfirmedConcern week at Elevated (the action gate)', () => {
    const a = summary({
      concernDistribution: {
        routine: 10,
        novelNotConcerning: 0,
        potentiallyConcerning: 0,
        clearlyConcerning: 4,
      },
      actionConfirmedCount: 0,
      discussionConfirmedCount: 4,
      weightedConcern: { potentiallyConcerning: 0, clearlyConcerning: 2 },
      concernRate: 4 / 14,
    });
    const r = synthesizeConvergence(null, a, null);
    expect(r.status).toBe('Elevated');
    expect(r.evidenceMix).toEqual({
      actionConfirmed: 0,
      discussionConfirmed: 4,
      ccGateApplied: true,
    });
  });

  it('lets one action confirmation through the gate', () => {
    const a = summary({
      concernDistribution: {
        routine: 10,
        novelNotConcerning: 0,
        potentiallyConcerning: 0,
        clearlyConcerning: 4,
      },
      actionConfirmedCount: 1,
      discussionConfirmedCount: 3,
      weightedConcern: { potentiallyConcerning: 0, clearlyConcerning: 2.5 },
      concernRate: 4 / 14,
    });
    const r = synthesizeConvergence(null, a, null);
    expect(r.status).toBe('ConfirmedConcern');
    expect(r.evidenceMix?.ccGateApplied).toBe(false);
  });

  it('discussion evidence still fully counts toward Elevated (variant B: raw Elevated thresholds)', () => {
    const a = summary({
      concernDistribution: {
        routine: 10,
        novelNotConcerning: 0,
        potentiallyConcerning: 2,
        clearlyConcerning: 0,
      },
      actionConfirmedCount: 0,
      discussionConfirmedCount: 2,
      weightedConcern: { potentiallyConcerning: 1, clearlyConcerning: 0 },
      concernRate: 2 / 14,
    });
    expect(synthesizeConvergence(null, a, null).status).toBe('Elevated');
  });

  it('two ACTION potentials still elevate (weight 1.0 unchanged)', () => {
    const a = summary({
      concernDistribution: {
        routine: 10,
        novelNotConcerning: 0,
        potentiallyConcerning: 2,
        clearlyConcerning: 0,
      },
      actionConfirmedCount: 2,
      discussionConfirmedCount: 0,
      weightedConcern: { potentiallyConcerning: 2, clearlyConcerning: 0 },
      concernRate: 2 / 14,
    });
    expect(synthesizeConvergence(null, a, null).status).toBe('Elevated');
  });

  it('summaries without tier counts keep the ungraded behavior exactly', () => {
    const a = summary({
      concernDistribution: {
        routine: 10,
        novelNotConcerning: 0,
        potentiallyConcerning: 0,
        clearlyConcerning: 4,
      },
      concernRate: 4 / 14,
    });
    const r = synthesizeConvergence(null, a, null);
    expect(r.status).toBe('ConfirmedConcern');
    expect(r.evidenceMix).toBeUndefined();
  });
});
