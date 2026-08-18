import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OverviewStatusSummary } from '@/components/overview/OverviewStatusSummary';
import type { ConcernLevel } from '@/lib/types';

describe('OverviewStatusSummary', () => {
  it('renders stacked bar and legend for all statuses', () => {
    const statusCounts: Record<ConcernLevel, number> = {
      Stable: 500,
      Elevated: 65,
      Divergent: 0,
      ConfirmedConcern: 5,
    };
    render(<OverviewStatusSummary statusCounts={statusCounts} />);
    expect(screen.getByText('Consistent with baseline: 500')).toBeDefined();
    expect(screen.getByText('Notable departure: 65')).toBeDefined();
    expect(screen.getByText('Sustained departure: 5')).toBeDefined();
    expect(screen.getByText('570 total category-weeks')).toBeDefined();
  });

  it('shows zero-count statuses in legend', () => {
    const statusCounts: Record<ConcernLevel, number> = {
      Stable: 100,
      Elevated: 0,
      Divergent: 0,
      ConfirmedConcern: 0,
    };
    render(<OverviewStatusSummary statusCounts={statusCounts} />);
    expect(screen.getByText('Consistent with baseline: 100')).toBeDefined();
    expect(screen.getByText('Notable departure: 0')).toBeDefined();
    expect(screen.getByText('Sustained departure: 0')).toBeDefined();
  });

  it('renders group with aria-label', () => {
    const statusCounts: Record<ConcernLevel, number> = {
      Stable: 11,
      Elevated: 0,
      Divergent: 0,
      ConfirmedConcern: 0,
    };
    const { container } = render(<OverviewStatusSummary statusCounts={statusCounts} />);
    const group = container.querySelector('[role="group"]');
    expect(group).toBeDefined();
    expect(group?.getAttribute('aria-label')).toBe('Status distribution');
  });

  it('shows empty message when total is zero', () => {
    const statusCounts: Record<ConcernLevel, number> = {
      Stable: 0,
      Elevated: 0,
      Divergent: 0,
      ConfirmedConcern: 0,
    };
    render(<OverviewStatusSummary statusCounts={statusCounts} />);
    expect(screen.getByText('No status data available.')).toBeDefined();
  });
});
