import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConcernHeader } from '@/components/category/ConcernHeader';
import type { ConcernAssessment } from '@/lib/types/structural';

vi.mock('@/lib/contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedMode: 'light' }),
}));

function makeSynthesis(overrides: Partial<ConcernAssessment> = {}): ConcernAssessment {
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

describe('ConcernHeader', () => {
  it('shows "no concern data" when synthesis is null', () => {
    render(<ConcernHeader synthesis={null} />);
    expect(screen.getByText('No concern data available.')).toBeDefined();
  });

  it('renders Stable status', () => {
    render(<ConcernHeader synthesis={makeSynthesis()} />);
    expect(screen.getByText('Stable')).toBeDefined();
  });

  it('renders Elevated status with pattern', () => {
    render(
      <ConcernHeader
        synthesis={makeSynthesis({
          status: 'Elevated',
          aiElevated: true,
          layersElevated: 1,
          pattern: 'AI content assessment elevated',
        })}
      />,
    );
    expect(screen.getByText('Elevated')).toBeDefined();
    expect(screen.getByText('AI content assessment elevated')).toBeDefined();
  });

  it('renders Divergent status (legacy)', () => {
    render(
      <ConcernHeader
        synthesis={makeSynthesis({
          status: 'Divergent',
          aiElevated: true,
          layersElevated: 1,
        })}
      />,
    );
    expect(screen.getByText('Divergent')).toBeDefined();
  });

  it('renders ConfirmedConcern status', () => {
    render(
      <ConcernHeader
        synthesis={makeSynthesis({
          status: 'ConfirmedConcern',
          aiElevated: true,
          layersElevated: 1,
        })}
      />,
    );
    expect(screen.getByText('ConfirmedConcern')).toBeDefined();
  });

  it('shows bootstrap badge', () => {
    render(<ConcernHeader synthesis={makeSynthesis({ bootstrap: true })} />);
    expect(screen.getByText('Bootstrap')).toBeDefined();
  });

  it('hides bootstrap badge when false', () => {
    render(<ConcernHeader synthesis={makeSynthesis({ bootstrap: false })} />);
    expect(screen.queryByText('Bootstrap')).toBeNull();
  });

  it('shows pattern text', () => {
    render(<ConcernHeader synthesis={makeSynthesis({ pattern: 'Test pattern description' })} />);
    expect(screen.getByText('Test pattern description')).toBeDefined();
  });
});
