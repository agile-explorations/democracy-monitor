import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OverviewStatusSummary } from '@/components/overview/OverviewStatusSummary';
import type { ConvergenceStatus } from '@/lib/types';

describe('OverviewStatusSummary', () => {
  it('renders badges for non-zero counts', () => {
    const statusCounts: Record<ConvergenceStatus, number> = {
      Stable: 5,
      Elevated: 3,
      Divergent: 2,
      ConfirmedConcern: 1,
    };
    render(<OverviewStatusSummary statusCounts={statusCounts} />);
    expect(screen.getByText(/5 Stable/)).toBeDefined();
    expect(screen.getByText(/3 Elevated/)).toBeDefined();
    expect(screen.getByText(/2 Divergent/)).toBeDefined();
    expect(screen.getByText(/1 Confirmed Concern/)).toBeDefined();
  });

  it('hides badges for zero counts', () => {
    const statusCounts: Record<ConvergenceStatus, number> = {
      Stable: 11,
      Elevated: 0,
      Divergent: 0,
      ConfirmedConcern: 0,
    };
    render(<OverviewStatusSummary statusCounts={statusCounts} />);
    expect(screen.getByText(/11 Stable/)).toBeDefined();
    expect(screen.queryByText(/Elevated/)).toBeNull();
    expect(screen.queryByText(/Divergent/)).toBeNull();
    expect(screen.queryByText(/Confirmed Concern/)).toBeNull();
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
});
