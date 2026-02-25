import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConvergenceHeader } from '@/components/category/ConvergenceHeader';
import type { ConvergenceSynthesis } from '@/lib/types/structural';

vi.mock('@/lib/contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedMode: 'light' }),
}));

function makeSynthesis(overrides: Partial<ConvergenceSynthesis> = {}): ConvergenceSynthesis {
  return {
    status: 'Stable',
    structuralElevated: false,
    aiElevated: false,
    thematicElevated: false,
    layersElevated: 0,
    pattern: 'No anomalies detected',
    bootstrap: false,
    ...overrides,
  };
}

describe('ConvergenceHeader', () => {
  it('shows "no convergence data" when synthesis is null', () => {
    render(<ConvergenceHeader synthesis={null} />);
    expect(screen.getByText('No convergence data available.')).toBeDefined();
  });

  it('renders Stable status', () => {
    render(<ConvergenceHeader synthesis={makeSynthesis()} />);
    expect(screen.getByText('Stable')).toBeDefined();
    expect(screen.getByText('0 of 3 layers elevated')).toBeDefined();
  });

  it('renders Elevated status with 1 layer', () => {
    render(
      <ConvergenceHeader
        synthesis={makeSynthesis({
          status: 'Elevated',
          structuralElevated: true,
          layersElevated: 1,
          pattern: 'Structural anomaly only',
        })}
      />,
    );
    expect(screen.getByText('Elevated')).toBeDefined();
    expect(screen.getByText('1 of 3 layers elevated')).toBeDefined();
    expect(screen.getByText('Structural anomaly only')).toBeDefined();
  });

  it('renders Divergent status', () => {
    render(
      <ConvergenceHeader
        synthesis={makeSynthesis({
          status: 'Divergent',
          structuralElevated: true,
          aiElevated: true,
          layersElevated: 2,
        })}
      />,
    );
    expect(screen.getByText('Divergent')).toBeDefined();
    expect(screen.getByText('2 of 3 layers elevated')).toBeDefined();
  });

  it('renders ConfirmedConcern status', () => {
    render(
      <ConvergenceHeader
        synthesis={makeSynthesis({
          status: 'ConfirmedConcern',
          structuralElevated: true,
          aiElevated: true,
          thematicElevated: true,
          layersElevated: 3,
        })}
      />,
    );
    expect(screen.getByText('ConfirmedConcern')).toBeDefined();
    expect(screen.getByText('3 of 3 layers elevated')).toBeDefined();
  });

  it('shows bootstrap badge', () => {
    render(<ConvergenceHeader synthesis={makeSynthesis({ bootstrap: true })} />);
    expect(screen.getByText('Bootstrap')).toBeDefined();
  });

  it('hides bootstrap badge when false', () => {
    render(<ConvergenceHeader synthesis={makeSynthesis({ bootstrap: false })} />);
    expect(screen.queryByText('Bootstrap')).toBeNull();
  });

  it('shows pattern text', () => {
    render(
      <ConvergenceHeader synthesis={makeSynthesis({ pattern: 'Test pattern description' })} />,
    );
    expect(screen.getByText('Test pattern description')).toBeDefined();
  });
});
