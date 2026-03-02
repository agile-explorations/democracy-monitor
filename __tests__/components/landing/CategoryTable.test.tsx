import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CategoryTable } from '@/components/landing/CategoryTable';
import type { CategorySummary } from '@/lib/services/category-summary-service';

// Mock next/link since test env doesn't have Next.js router
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}));

const mockCategory: CategorySummary = {
  category: 'civilService',
  title: 'Government Worker Protections',
  status: 'Stable',
  insufficientData: false,
  decayWeightedScore: 3.2,
  baselineAvg: 2.5,
  baselineStdDev: 0.8,
  sparklineData: [
    { week: '2026-01-05', score: 2.1 },
    { week: '2026-01-12', score: 2.8 },
    { week: '2026-01-19', score: 3.2 },
  ],
  documentCount: 12,
  flaggedCount: 2,
  summary: 'Test summary',
  assessedAt: '2026-01-19T00:00:00Z',
  convergenceStatus: 'Stable',
  structuralElevated: false,
  aiElevated: false,
  thematicElevated: false,
};

describe('CategoryTable', () => {
  it('renders category rows', () => {
    const { container } = render(
      <CategoryTable categories={[mockCategory]} readingLevel="general" />,
    );
    expect(container.querySelector('table')).toBeDefined();
    expect(container.textContent).toContain('Government Worker Protections');
  });

  it('passes highlightWeek to Sparkline SVG', () => {
    const { container } = render(
      <CategoryTable
        categories={[mockCategory]}
        readingLevel="general"
        highlightWeek="2026-01-12"
      />,
    );
    // When highlightWeek matches a data point, Sparkline renders a circle element
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(1);
  });

  it('does not render highlight dot when highlightWeek is null', () => {
    const { container } = render(
      <CategoryTable categories={[mockCategory]} readingLevel="general" highlightWeek={null} />,
    );
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(0);
  });
});
