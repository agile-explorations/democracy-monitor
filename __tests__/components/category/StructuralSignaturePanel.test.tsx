import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StructuralSignaturePanel } from '@/components/category/StructuralSignaturePanel';
import type { StructuralScore } from '@/lib/types/structural';

function makeDimension(zScore = 0.5) {
  return { value: 0.1, baselineMean: 0.08, baselineStdDev: 0.04, zScore, available: true };
}

function makeScore(overrides: Partial<StructuralScore> = {}): StructuralScore {
  return {
    composite: 1.5,
    dimensions: {
      volume: makeDimension(1.2),
      typeComposition: makeDimension(0.8),
      functionalDistribution: makeDimension(0.5),
      agencyActivity: makeDimension(0.3),
      publicationTempo: makeDimension(0.2),
      sourceConvergence: makeDimension(0.1),
    },
    anomalous: false,
    functionalShifts: [],
    longHorizon: { cumulativeDeviation: 0.5, cumulativeWindow: 12, driftTrend: 'stable' },
    ...overrides,
  };
}

describe('StructuralSignaturePanel', () => {
  it('shows "no structural data" when score is null', () => {
    render(<StructuralSignaturePanel score={null} readingLevel="summary" />);
    expect(screen.getByText('No structural data available.')).toBeDefined();
  });

  it('shows composite score in summary mode', () => {
    render(<StructuralSignaturePanel score={makeScore()} readingLevel="summary" />);
    expect(screen.getByText('1.50')).toBeDefined();
    expect(screen.queryByText('Volume')).toBeNull(); // dimensions hidden in summary
  });

  it('shows anomalous badge when anomalous', () => {
    render(
      <StructuralSignaturePanel score={makeScore({ anomalous: true })} readingLevel="summary" />,
    );
    expect(screen.getByText('Anomalous')).toBeDefined();
  });

  it('shows all 6 dimensions in detailed mode', () => {
    render(<StructuralSignaturePanel score={makeScore()} readingLevel="detailed" />);
    expect(screen.getByText('Volume')).toBeDefined();
    expect(screen.getByText('Type Composition')).toBeDefined();
    expect(screen.getByText('Functional Distribution')).toBeDefined();
    expect(screen.getByText('Agency Activity')).toBeDefined();
    expect(screen.getByText('Publication Tempo')).toBeDefined();
    expect(screen.getByText('Source Convergence')).toBeDefined();
  });

  it('shows functional shifts in detailed mode', () => {
    const score = makeScore({
      functionalShifts: [
        { bucket: 'rulemaking', baselineRate: 0.1, currentRate: 0.25, direction: 'increased' },
      ],
    });
    render(<StructuralSignaturePanel score={score} readingLevel="detailed" />);
    expect(screen.getByText('Functional Shifts')).toBeDefined();
    expect(screen.getByText('rulemaking')).toBeDefined();
  });

  it('shows long horizon info in detailed mode', () => {
    render(<StructuralSignaturePanel score={makeScore()} readingLevel="detailed" />);
    const container = document.body;
    expect(container.textContent).toContain('Cumulative deviation');
    expect(container.textContent).toContain('12 weeks');
  });

  it('skips unavailable dimensions', () => {
    const score = makeScore();
    score.dimensions.sourceConvergence = { ...makeDimension(), available: false };
    render(<StructuralSignaturePanel score={score} readingLevel="detailed" />);
    expect(screen.queryByText('Source Convergence')).toBeNull();
  });
});
