import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EvidencePanel } from '@/components/category/EvidencePanel';

describe('EvidencePanel', () => {
  it('shows "no keyword matches" when matches is empty', () => {
    render(<EvidencePanel matches={[]} readingLevel="summary" />);
    expect(screen.getByText('No keyword matches in this assessment.')).toBeDefined();
  });

  it('renders matches as ungrouped keywords', () => {
    render(<EvidencePanel matches={['schedule f', 'impoundment']} readingLevel="summary" />);
    expect(screen.getByText('schedule f')).toBeDefined();
    expect(screen.getByText('impoundment')).toBeDefined();
  });

  it('groups keywords by tier when keywordMatches provided', () => {
    render(
      <EvidencePanel
        matches={['schedule f', 'workforce']}
        keywordMatches={[
          { keyword: 'schedule f', tier: 'capture' },
          { keyword: 'workforce', tier: 'warning' },
        ]}
        readingLevel="summary"
      />,
    );
    expect(screen.getByText('Capture')).toBeDefined();
    expect(screen.getByText('Warning')).toBeDefined();
  });

  it('shows tier count badge', () => {
    const { container } = render(
      <EvidencePanel
        matches={['a', 'b', 'c']}
        keywordMatches={[
          { keyword: 'a', tier: 'capture' },
          { keyword: 'b', tier: 'drift' },
          { keyword: 'c', tier: 'warning' },
        ]}
        readingLevel="summary"
      />,
    );
    expect(container.textContent).toContain('1 capture');
    expect(container.textContent).toContain('1 drift');
    expect(container.textContent).toContain('1 warning');
  });

  it('renders reviewed documents with links', () => {
    render(
      <EvidencePanel
        matches={['test']}
        reviewedDocuments={[
          { title: 'FR Doc 123', url: 'https://example.com/123', date: '2026-02-10' },
          { title: 'FR Doc 456' },
        ]}
        readingLevel="summary"
      />,
    );
    const link = screen.getByText('FR Doc 123');
    expect(link.closest('a')?.getAttribute('href')).toBe('https://example.com/123');
    expect(screen.getByText('FR Doc 456')).toBeDefined();
  });

  it('hides suppressed keywords in summary mode', () => {
    render(
      <EvidencePanel
        matches={['test']}
        suppressedKeywords={[
          { keyword: 'routine', assessment: 'false_positive', reasoning: 'Too generic' },
        ]}
        readingLevel="summary"
      />,
    );
    expect(screen.queryByText('What was suppressed')).toBeNull();
  });

  it('shows suppressed keywords in detailed mode', () => {
    render(
      <EvidencePanel
        matches={['test']}
        suppressedKeywords={[
          { keyword: 'routine', assessment: 'false_positive', reasoning: 'Too generic' },
        ]}
        readingLevel="detailed"
      />,
    );
    expect(screen.getByText('What was suppressed')).toBeDefined();
    expect(screen.getByText('routine')).toBeDefined();
  });
});
