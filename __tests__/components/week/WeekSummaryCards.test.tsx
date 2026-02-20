import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WeekSummaryCards } from '@/components/week/WeekSummaryCards';

const defaultProps = {
  totalScore: 12.4,
  documentCount: 47,
  captureCount: 1,
  driftCount: 3,
  warningCount: 8,
  baselineAvg: 3.2,
};

describe('WeekSummaryCards', () => {
  it('renders total score', () => {
    const { container } = render(<WeekSummaryCards {...defaultProps} />);
    expect(container.textContent).toContain('12.4');
  });

  it('renders document count', () => {
    const { container } = render(<WeekSummaryCards {...defaultProps} />);
    expect(container.textContent).toContain('47');
  });

  it('renders severity mix', () => {
    const { container } = render(<WeekSummaryCards {...defaultProps} />);
    expect(container.textContent).toContain('1C');
    expect(container.textContent).toContain('3D');
    expect(container.textContent).toContain('8W');
  });

  it('renders baseline ratio', () => {
    const { container } = render(<WeekSummaryCards {...defaultProps} />);
    expect(container.textContent).toContain('3.9');
    expect(container.textContent).toContain('baseline');
  });

  it('shows "Within baseline" when ratio is near 1.0', () => {
    const { container } = render(<WeekSummaryCards {...defaultProps} totalScore={3.2} />);
    expect(container.textContent).toContain('Within baseline');
  });

  it('shows "No baseline" when baseline is zero', () => {
    const { container } = render(<WeekSummaryCards {...defaultProps} baselineAvg={0} />);
    expect(container.textContent).toContain('No baseline');
  });

  it('renders all four stat cards', () => {
    const { container } = render(<WeekSummaryCards {...defaultProps} />);
    expect(container.textContent).toContain('Total Score');
    expect(container.textContent).toContain('Documents Scored');
    expect(container.textContent).toContain('Severity Mix');
    expect(container.textContent).toContain('vs. Baseline');
  });
});
