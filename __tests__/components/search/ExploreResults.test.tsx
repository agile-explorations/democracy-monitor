import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExploreFilters, ExploreResults } from '@/components/search/ExploreResults';
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

  it('leads with a plain-language summary and hides per-category jargon until expanded', () => {
    render(
      <ExploreResults
        result={result([doc({}), doc({ id: 2, category: 'watchdogs', finalScore: 0 })], 1)}
        page={1}
        onPageChange={() => {}}
      />,
    );
    // Collapsed: one summary line, no per-category badge rows
    expect(screen.getByText(/AI: clear departure \(92%\) across all 2 categories/)).toBeTruthy();
    expect(screen.getByText(/Top score: 6\.0/)).toBeTruthy();
    expect(screen.queryByText('1 strong keyword signal')).toBeNull();
    expect(screen.queryByText(/executive order/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Assessment details' }));
    // Expanded: humanized badges with explanatory tooltips
    expect(screen.getAllByText('1 strong keyword signal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 moderate keyword signals').length).toBeGreaterThan(0);
    expect(screen.queryByText('1C')).toBeNull();
    const score = screen.getByText('Score: 6.0');
    expect(score.getAttribute('title')).toMatch(/IN THIS CATEGORY/);
    expect(screen.getAllByText('formal override')[0].getAttribute('title')).toMatch(
      /institutional protections/i,
    );
  });
});

describe('ExploreResults unrouted badge (#895)', () => {
  it('labels rows no router placed "Not routed to a category" instead of a category', () => {
    render(
      <ExploreResults
        result={result(
          [doc({ category: 'civilService' }), doc({ id: 2, category: 'corpus', routed: false })],
          1,
        )}
        page={1}
        onPageChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Assessment details' }));
    const badge = screen.getByText('Not routed to a category');
    expect(badge.getAttribute('title')).toMatch(/not detection evidence/i);
    expect(screen.queryByText('corpus')).toBeNull();
    // The routed sibling row still wears its category title.
    expect(screen.getByText('Government Worker Protections')).toBeTruthy();
  });

  it('labels an off-topic row unrouted even though it carries a real category', () => {
    render(
      <ExploreResults
        result={result([doc({ category: 'mediaFreedom', routed: false })], 1)}
        page={1}
        onPageChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Assessment details' }));
    expect(screen.getByText('Not routed to a category')).toBeTruthy();
    expect(screen.queryByText('Press Freedom')).toBeNull();
  });
});

describe('ExploreFilters unrouted toggle (#895)', () => {
  function renderFilters(includeUnrouted: boolean, setIncludeUnrouted: (v: boolean) => void) {
    render(
      <ExploreFilters
        filterCategory=""
        setFilterCategory={() => {}}
        filterSource=""
        setFilterSource={() => {}}
        filterSort="relevance"
        setFilterSort={() => {}}
        includeUnrouted={includeUnrouted}
        setIncludeUnrouted={setIncludeUnrouted}
      />,
    );
  }

  it('is off by default and reports a change when ticked', () => {
    const calls: boolean[] = [];
    renderFilters(false, (v) => calls.push(v));
    const box = screen.getByRole('checkbox', {
      name: 'Include documents not routed to a category',
    }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(calls).toEqual([true]);
  });

  it('offers the "Not routed to a category" facet in the category select', () => {
    renderFilters(false, () => {});
    expect(screen.getByRole('option', { name: 'Not routed to a category' })).toBeTruthy();
  });
});
