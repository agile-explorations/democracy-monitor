import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ledgerCounts, REVERSAL_KIND_LABELS, REVERSALS_LEDGER } from '@/lib/data/reversals-ledger';
import ReversalsPage, { DetailedContent, SummaryContent } from '@/pages/system/reversals';

vi.mock('next/head', () => ({
  default: function MockHead({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  },
}));

vi.mock('next/link', () => ({
  default: function MockLink({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock('@/lib/contexts/ReadingLevelContext', () => ({
  useReadingLevel: () => ({ readingLevel: 'detailed', setReadingLevel: () => {} }),
}));

describe('reversals page (#814)', () => {
  it('detailed view renders every ledger entry with its evidence links', () => {
    const { container } = render(<DetailedContent />);
    for (const e of REVERSALS_LEDGER) {
      expect(container.textContent).toContain(e.what);
      expect(container.textContent).toContain(e.why);
    }
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    for (const e of REVERSALS_LEDGER) for (const u of e.evidence) expect(hrefs).toContain(u);
  });

  it('summary view shows the counts by kind and the five most recent entries', () => {
    const { container } = render(<SummaryContent />);
    const counts = ledgerCounts(REVERSALS_LEDGER);
    for (const kind of Object.keys(counts) as Array<keyof typeof counts>) {
      expect(container.textContent).toContain(REVERSAL_KIND_LABELS[kind]);
    }
    for (const e of REVERSALS_LEDGER.slice(0, 5)) expect(container.textContent).toContain(e.what);
    expect(container.textContent).not.toContain(REVERSALS_LEDGER[REVERSALS_LEDGER.length - 1].what);
  });

  it('states that the page is updated with every release and links the charter', () => {
    const { container } = render(<ReversalsPage />);
    expect(container.textContent).toContain('updated with every release');
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/why-this-matters#charter');
  });
});

describe('count lead (editorial guidance, 2026-08-30)', () => {
  it('opens with the computed totals in the shared header, whatever the reading level', () => {
    const { container } = render(<ReversalsPage />);
    expect(container.textContent).toMatch(/\d+ entries since [A-Z][a-z]+ \d{4}:/);
  });
});
