import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SourceHealthBar } from '@/components/landing/SourceHealthBar';
import type { SourceHealthBarProps } from '@/components/landing/SourceHealthBar';

function makeProps(overrides: Partial<SourceHealthBarProps> = {}): SourceHealthBarProps {
  return {
    healthySources: 8,
    degradedSources: 0,
    unavailableSources: 0,
    silentSources: 0,
    totalSources: 8,
    ...overrides,
  };
}

describe('SourceHealthBar', () => {
  it('renders nothing when totalSources is 0', () => {
    const { container } = render(<SourceHealthBar {...makeProps({ totalSources: 0 })} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows all-healthy summary', () => {
    const { container } = render(<SourceHealthBar {...makeProps()} />);
    expect(container.textContent).toContain('8/8 data sources responding');
  });

  it('renders correct dot counts', () => {
    render(
      <SourceHealthBar
        {...makeProps({
          healthySources: 5,
          degradedSources: 1,
          unavailableSources: 1,
          silentSources: 1,
          totalSources: 8,
        })}
      />,
    );
    const dotContainer = screen.getByLabelText('5 healthy, 2 impaired, 1 unavailable');
    const dots = dotContainer.querySelectorAll('span');
    // 5 healthy + 2 impaired (degraded+silent) + 1 unavailable = 8 dots
    expect(dots.length).toBe(8);
  });

  it('shows impaired count when sources are degraded or silent', () => {
    const { container } = render(
      <SourceHealthBar
        {...makeProps({
          healthySources: 6,
          degradedSources: 1,
          silentSources: 1,
          totalSources: 8,
        })}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('6/8 responding');
    expect(text).toContain('2 impaired');
  });

  it('links to /health page', () => {
    render(<SourceHealthBar {...makeProps()} />);
    const link = screen.getByText(/Details/);
    expect(link.closest('a')?.getAttribute('href')).toBe('/health');
  });
});
