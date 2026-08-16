import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuoteVerificationBadge } from '@/components/search/QuoteVerificationBadge';

describe('QuoteVerificationBadge states (#725)', () => {
  it('renders nothing before verification arrives', () => {
    const { container } = render(<QuoteVerificationBadge verification={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('announces an unavailable verifier distinctly', () => {
    render(
      <QuoteVerificationBadge
        verification={{ unavailable: true, totalQuotes: 0, verifiedCount: 0, unverified: [] }}
      />,
    );
    expect(screen.getByText(/verification was unavailable/)).toBeTruthy();
  });

  it('explains a quote-free answer instead of hiding', () => {
    render(
      <QuoteVerificationBadge
        verification={{ totalQuotes: 0, verifiedCount: 0, unverified: [] }}
      />,
    );
    expect(screen.getByText(/No quoted passages in this answer/)).toBeTruthy();
  });

  it('keeps the green all-verified line, counting corrections', () => {
    render(
      <QuoteVerificationBadge
        verification={{
          totalQuotes: 3,
          verifiedCount: 3,
          corrections: [{ quote: 'q', from: [2], to: [5], kind: 'replaced' }],
          unverified: [],
        }}
      />,
    );
    expect(screen.getByText(/All 3 quoted passages verified/)).toBeTruthy();
    expect(screen.getByText(/1 citation auto-corrected/)).toBeTruthy();
  });

  it('keeps the amber warning for unresolved misses', () => {
    render(
      <QuoteVerificationBadge
        verification={{
          totalQuotes: 2,
          verifiedCount: 1,
          unverified: [{ quote: 'a missed quote', citations: [4] }],
        }}
      />,
    );
    expect(screen.getByText(/1 of 2 quoted passages could not be verified/)).toBeTruthy();
  });
});
