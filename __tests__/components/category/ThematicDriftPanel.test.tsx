import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThematicDriftPanel } from '@/components/category/ThematicDriftPanel';
import type { ThematicDriftScore } from '@/lib/types/structural';

function makeDrift(overrides: Partial<ThematicDriftScore> = {}): ThematicDriftScore {
  return {
    rollingCentroidDistance: 0.0523,
    rollingWindow: { weeks: 8, meanDistance: 0.04, stdDev: 0.01 },
    zScore: 1.23,
    novelDocumentRate: 0.12,
    varianceRatio: 1.05,
    crossAdminDistance: null,
    crossAdminBaseline: null,
    bootstrap: false,
    ...overrides,
  };
}

describe('ThematicDriftPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            shiftLabels: { fromTerms: ['routine', 'standard'], toTerms: ['emergency', 'action'] },
          }),
      }),
    );
  });

  it('shows "no thematic data" when drift is null', () => {
    render(<ThematicDriftPanel drift={null} readingLevel="summary" />);
    expect(screen.getByText('No thematic data available.')).toBeDefined();
  });

  it('shows z-score and novel doc rate in summary mode', () => {
    render(<ThematicDriftPanel drift={makeDrift()} readingLevel="summary" />);
    expect(screen.getByText('1.23')).toBeDefined();
    expect(screen.getByText('12.0%')).toBeDefined();
  });

  it('shows bootstrap indicator in summary mode', () => {
    render(<ThematicDriftPanel drift={makeDrift({ bootstrap: true })} readingLevel="summary" />);
    expect(screen.getByText('Bootstrap')).toBeDefined();
  });

  it('shows full metrics in detailed mode', () => {
    render(<ThematicDriftPanel drift={makeDrift()} readingLevel="detailed" />);
    expect(screen.getByText('Centroid Distance')).toBeDefined();
    expect(screen.getByText('Z-Score')).toBeDefined();
    expect(screen.getByText('Novel Document Rate')).toBeDefined();
    expect(screen.getByText('Variance Ratio')).toBeDefined();
  });

  it('shows cross-admin distance when available', () => {
    render(
      <ThematicDriftPanel
        drift={makeDrift({ crossAdminDistance: 0.089, crossAdminBaseline: 'biden_2022' })}
        readingLevel="detailed"
      />,
    );
    expect(screen.getByText('Cross-Admin Distance')).toBeDefined();
    const body = document.body.textContent ?? '';
    expect(body).toContain('biden_2022');
  });

  it('shows bootstrap message in detailed mode', () => {
    render(<ThematicDriftPanel drift={makeDrift({ bootstrap: true })} readingLevel="detailed" />);
    expect(screen.getByText(/Bootstrap period/)).toBeDefined();
  });
});
