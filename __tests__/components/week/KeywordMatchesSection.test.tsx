import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KeywordMatchesSection } from '@/components/week/KeywordMatchesSection';
import type { DocumentExplanation } from '@/lib/types/explanation';

function makeDoc(overrides: Partial<DocumentExplanation> = {}): DocumentExplanation {
  return {
    url: 'https://example.com/doc1',
    title: 'Test Document',
    documentClass: 'Rule',
    classMultiplier: 1.5,
    severityScore: 2.0,
    finalScore: 3.0,
    formula: 'test',
    tierBreakdown: [],
    matches: [],
    suppressed: [],
    ...overrides,
  };
}

describe('KeywordMatchesSection', () => {
  it('shows "no keyword matches" when documents have no matches', () => {
    const { getByText } = render(
      <KeywordMatchesSection documents={[makeDoc()]} readingLevel="summary" />,
    );
    expect(getByText('No keyword matches this week.')).toBeTruthy();
  });

  it('groups keywords by tier', () => {
    const doc = makeDoc({
      matches: [
        { keyword: 'contempt of court', tier: 'capture', context: '', position: 0 },
        { keyword: 'delayed compliance', tier: 'drift', context: '', position: 0 },
        { keyword: 'judicial review', tier: 'warning', context: '', position: 0 },
      ],
    });
    const { container } = render(
      <KeywordMatchesSection documents={[doc]} readingLevel="summary" />,
    );
    expect(container.textContent).toContain('Capture');
    expect(container.textContent).toContain('Drift');
    expect(container.textContent).toContain('Warning');
    expect(container.textContent).toContain('contempt of court');
    expect(container.textContent).toContain('delayed compliance');
    expect(container.textContent).toContain('judicial review');
  });

  it('aggregates same keyword across documents', () => {
    const doc1 = makeDoc({
      url: 'https://example.com/doc1',
      matches: [{ keyword: 'contempt of court', tier: 'capture', context: '', position: 0 }],
    });
    const doc2 = makeDoc({
      url: 'https://example.com/doc2',
      title: 'Second Doc',
      matches: [{ keyword: 'contempt of court', tier: 'capture', context: '', position: 0 }],
    });
    const { container } = render(
      <KeywordMatchesSection documents={[doc1, doc2]} readingLevel="summary" />,
    );
    // Should show 1 match, not 2
    expect(container.textContent).toContain('1 match');
  });

  it('shows document links in detailed mode', () => {
    const doc = makeDoc({
      matches: [{ keyword: 'delayed compliance', tier: 'drift', context: '', position: 0 }],
    });
    const { getByText } = render(
      <KeywordMatchesSection documents={[doc]} readingLevel="detailed" />,
    );
    expect(getByText('Test Document')).toBeTruthy();
  });

  it('hides document links in summary mode', () => {
    const doc = makeDoc({
      matches: [{ keyword: 'delayed compliance', tier: 'drift', context: '', position: 0 }],
    });
    const { queryByText } = render(
      <KeywordMatchesSection documents={[doc]} readingLevel="summary" />,
    );
    // The document title should not be visible as a link
    expect(queryByText('found in')).toBeNull();
  });

  it('shows correct match count for multiple keywords', () => {
    const doc = makeDoc({
      matches: [
        { keyword: 'contempt of court', tier: 'capture', context: '', position: 0 },
        { keyword: 'defiance of order', tier: 'capture', context: '', position: 0 },
      ],
    });
    const { container } = render(
      <KeywordMatchesSection documents={[doc]} readingLevel="summary" />,
    );
    expect(container.textContent).toContain('2 matches');
  });
});
