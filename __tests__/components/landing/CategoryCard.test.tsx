import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CategoryCard } from '@/components/landing/CategoryCard';

const defaultProps = {
  category: 'civilService',
  title: 'Government Worker Protections',
  status: 'Drift' as const,
  decayWeightedScore: 12.4,
  baselineAvg: 3.2,
  baselineStdDev: 1.1,
  sparklineData: [
    { week: '2026-01-05', score: 5.0 },
    { week: '2026-01-12', score: 8.2 },
    { week: '2026-01-19', score: 12.4 },
  ],
  documentCount: 12,
  flaggedCount: 4,
  summary: 'Elevated keyword signals related to workforce reclassification.',
  readingLevel: 'summary' as const,
};

describe('CategoryCard', () => {
  it('renders title and status', () => {
    const { getByText, getByRole } = render(<CategoryCard {...defaultProps} />);
    expect(getByText('Government Worker Protections')).toBeTruthy();
    expect(getByRole('status').textContent).toContain('Drift');
  });

  it('renders score and baseline values', () => {
    const { getByText } = render(<CategoryCard {...defaultProps} />);
    expect(getByText('Current: 12.4')).toBeTruthy();
    expect(getByText('Baseline avg: 3.2')).toBeTruthy();
  });

  it('renders baseline ratio', () => {
    const { container } = render(<CategoryCard {...defaultProps} />);
    expect(container.textContent).toContain('3.9');
    expect(container.textContent).toContain('baseline');
  });

  it('renders summary text', () => {
    const { getByText } = render(<CategoryCard {...defaultProps} />);
    expect(getByText(/workforce reclassification/)).toBeTruthy();
  });

  it('renders document count and flagged count', () => {
    const { container } = render(<CategoryCard {...defaultProps} />);
    expect(container.textContent).toContain('12 docs this week');
    expect(container.textContent).toContain('4 flagged');
  });

  it('links to category detail page', () => {
    const { container } = render(<CategoryCard {...defaultProps} />);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/category/civilService');
  });

  it('renders experimental badge by default', () => {
    const { getByText } = render(<CategoryCard {...defaultProps} />);
    expect(getByText('Experimental')).toBeTruthy();
  });

  it('hides experimental badge when showExperimentalBadge is false', () => {
    const { queryByText } = render(
      <CategoryCard {...defaultProps} showExperimentalBadge={false} />,
    );
    expect(queryByText('Experimental')).toBeNull();
  });

  it('hides technical key in summary mode', () => {
    const { queryByText } = render(<CategoryCard {...defaultProps} readingLevel="summary" />);
    expect(queryByText('civilService')).toBeNull();
  });

  it('shows technical key in detailed mode', () => {
    const { getByText } = render(<CategoryCard {...defaultProps} readingLevel="detailed" />);
    expect(getByText('civilService')).toBeTruthy();
  });

  it('uses same style for all statuses', () => {
    const { container } = render(<CategoryCard {...defaultProps} status="Stable" />);
    const card = container.querySelector('a');
    expect(card?.className).toContain('bg-dm-card');
  });

  it('hides ratio when baseline is zero', () => {
    const { container } = render(<CategoryCard {...defaultProps} baselineAvg={0} />);
    expect(container.textContent).not.toContain('baseline)');
  });

  it('hides flagged count when zero', () => {
    const { container } = render(<CategoryCard {...defaultProps} flaggedCount={0} />);
    expect(container.textContent).not.toContain('flagged');
  });
});
