import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DataIntegrityBanner } from '@/components/landing/DataIntegrityBanner';
import type { DataIntegrityBannerProps } from '@/components/landing/DataIntegrityBanner';

function makeProps(overrides: Partial<DataIntegrityBannerProps> = {}): DataIntegrityBannerProps {
  return {
    dataIntegrity: 'moderate',
    summary: 'Some sources degraded.',
    healthySources: 6,
    totalSources: 8,
    ...overrides,
  };
}

describe('DataIntegrityBanner', () => {
  it('renders nothing when integrity is high', () => {
    const { container } = render(<DataIntegrityBanner {...makeProps({ dataIntegrity: 'high' })} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders moderate banner with summary', () => {
    render(<DataIntegrityBanner {...makeProps()} />);
    expect(screen.getByText('Data availability: moderate')).toBeDefined();
    expect(screen.getByText('Some sources degraded.')).toBeDefined();
    expect(screen.getByText('6 of 8 sources healthy')).toBeDefined();
  });

  it('renders low banner', () => {
    render(<DataIntegrityBanner {...makeProps({ dataIntegrity: 'low' })} />);
    expect(screen.getByText('Data availability: low')).toBeDefined();
  });

  it('renders critical banner with absence-of-data warning', () => {
    render(
      <DataIntegrityBanner
        {...makeProps({ dataIntegrity: 'critical', healthySources: 1, totalSources: 10 })}
      />,
    );
    expect(screen.getByText('DATA SOURCES CRITICALLY DEGRADED')).toBeDefined();
    expect(
      screen.getByText('The absence of data may itself be a significant signal.'),
    ).toBeDefined();
    expect(screen.getByText('1 of 10 sources healthy')).toBeDefined();
  });

  it('has role="alert" for accessibility', () => {
    render(<DataIntegrityBanner {...makeProps({ dataIntegrity: 'critical' })} />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('links to /health page', () => {
    render(<DataIntegrityBanner {...makeProps()} />);
    const link = screen.getByText(/Source details/);
    expect(link.closest('a')?.getAttribute('href')).toBe('/health');
  });
});
