import { describe, expect, it } from 'vitest';
import { summarizeAssessment } from '@/components/search/ExploreCardAssessment';
import type { ExploreDocResult } from '@/components/search/types';

function row(overrides: Partial<ExploreDocResult>): ExploreDocResult {
  return {
    id: 1,
    category: 'civilService',
    finalScore: null,
    aiAssessment: null,
    aiConfidence: null,
    ...overrides,
  } as ExploreDocResult;
}

describe('summarizeAssessment', () => {
  it('picks the worst AI verdict and the top score with its category', () => {
    const s = summarizeAssessment([
      row({ aiAssessment: 'potentially_concerning', aiConfidence: 0.8, finalScore: 2 }),
      row({
        id: 2,
        category: 'watchdogs',
        aiAssessment: 'clearly_concerning',
        aiConfidence: 0.92,
        finalScore: 13,
      }),
      row({ id: 3, category: 'elections', finalScore: 0 }),
    ]);
    expect(s.verdict).toBe('clearly_concerning');
    expect(s.confidence).toBe(0.92);
    expect(s.verdictCategories).toBe(1);
    expect(s.totalCategories).toBe(3);
    expect(s.topScore).toBe(13);
    expect(s.topCategory).toBe('watchdogs');
  });

  it('reports no verdict when the AI reviewed nothing', () => {
    const s = summarizeAssessment([row({}), row({ id: 2 })]);
    expect(s.verdict).toBeNull();
    expect(s.topScore).toBeNull();
  });

  it('counts uniform verdicts across all categories', () => {
    const s = summarizeAssessment([
      row({ aiAssessment: 'clearly_concerning', aiConfidence: 0.9 }),
      row({ id: 2, aiAssessment: 'clearly_concerning', aiConfidence: 0.92 }),
    ]);
    expect(s.verdictCategories).toBe(2);
    expect(s.confidence).toBe(0.92); // highest confidence among worst-verdict rows
  });
});
