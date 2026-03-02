import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OverviewStatusSummary } from '@/components/overview/OverviewStatusSummary';
import type { ConvergenceStatus } from '@/lib/types';

describe('OverviewStatusSummary', () => {
  it('renders stacked bar and legend for all statuses', () => {
    const statusCounts: Record<ConvergenceStatus, number> = {
      Stable: 500,
      Elevated: 65,
      Divergent: 20,
      ConfirmedConcern: 5,
    };
    render(<OverviewStatusSummary statusCounts={statusCounts} />);
    expect(screen.getByText('Stable: 500')).toBeDefined();
    expect(screen.getByText('Elevated: 65')).toBeDefined();
    expect(screen.getByText('Divergent: 20')).toBeDefined();
    expect(screen.getByText('Confirmed Concern: 5')).toBeDefined();
    expect(screen.getByText('590 total category-weeks')).toBeDefined();
  });

  it('shows zero-count statuses in legend', () => {
    const statusCounts: Record<ConvergenceStatus, number> = {
      Stable: 100,
      Elevated: 0,
      Divergent: 0,
      ConfirmedConcern: 0,
    };
    render(<OverviewStatusSummary statusCounts={statusCounts} />);
    expect(screen.getByText('Stable: 100')).toBeDefined();
    expect(screen.getByText('Elevated: 0')).toBeDefined();
    expect(screen.getByText('Divergent: 0')).toBeDefined();
    expect(screen.getByText('Confirmed Concern: 0')).toBeDefined();
  });

  it('renders group with aria-label', () => {
    const statusCounts: Record<ConvergenceStatus, number> = {
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
    const statusCounts: Record<ConvergenceStatus, number> = {
      Stable: 0,
      Elevated: 0,
      Divergent: 0,
      ConfirmedConcern: 0,
    };
    render(<OverviewStatusSummary statusCounts={statusCounts} />);
    expect(screen.getByText('No status data available.')).toBeDefined();
  });
});
