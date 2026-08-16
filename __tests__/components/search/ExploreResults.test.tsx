import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExploreResults } from '@/components/search/ExploreResults';
import type { ExploreDocResult, ExploreResult } from '@/components/search/types';

function doc(overrides: Partial<ExploreDocResult>): ExploreDocResult {
  return {
    id: 1,
    title: 'Executive Order 13957',
    url: 'https://x.gov/eo',
    publishedAt: '2020-10-20',
    sourceType: 'govinfo_cpd',
    sourceOrigin: 'govinfo_cpd',
    caseId: null,
    category: 'workerProtections',
    snippet: null,
    cosineSimilarity: 0.43,
    textRank: null,
    severityScore: null,
    finalScore: 6.0,
    documentClass: 'executive_order',
    classMultiplier: 1.5,
    captureCount: 1,
    driftCount: 2,
    warningCount: null,
    suppressedCount: null,
    matches: null,
    suppressed: null,
    aiAssessment: 'clearly_concerning',
    aiConfidence: 0.92,
    aiErosionType: 'formal_override',
    aiReasoning: null,
    ...overrides,
  } as ExploreDocResult;
}

function result(documents: ExploreDocResult[], totalResults: number): ExploreResult {
  return { totalResults, page: 1, pageSize: 20, documents } as ExploreResult;
}

describe('ExploreResults (#728)', () => {
  it('reports the document-level count without a row/doc mismatch', () => {
    render(
      <ExploreResults
        result={result([doc({}), doc({ id: 2, category: 'watchdogs' })], 7)}
        page={1}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByText('7 matching documents')).toBeTruthy();
    expect(screen.queryByText(/unique documents/)).toBeNull();
  });

  it('humanizes capture/drift badges and explains scores via tooltips', () => {
    render(<ExploreResults result={result([doc({})], 1)} page={1} onPageChange={() => {}} />);
    expect(screen.getByText('1 capture signal')).toBeTruthy();
    expect(screen.getByText('2 drift signals')).toBeTruthy();
    expect(screen.queryByText('1C')).toBeNull();
    const score = screen.getByText('Score: 6.0');
    expect(score.getAttribute('title')).toMatch(/IN THIS CATEGORY/);
    expect(screen.getByText('formal override').getAttribute('title')).toMatch(/erosion/i);
  });
});
