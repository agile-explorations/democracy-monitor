import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TrendChart } from '@/components/category/TrendChart';

// Mock recharts to avoid rendering canvas in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: function MockResponsiveContainer({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return <div data-testid="responsive-container">{children}</div>;
  },
  ComposedChart: function MockComposedChart({ children }: { children: React.ReactNode }) {
    return <div data-testid="composed-chart">{children}</div>;
  },
  Line: function MockLine() {
    return <div data-testid="line" />;
  },
  Area: function MockArea() {
    return <div data-testid="area" />;
  },
  XAxis: function MockXAxis() {
    return null;
  },
  YAxis: function MockYAxis() {
    return null;
  },
  CartesianGrid: function MockCartesianGrid() {
    return null;
  },
  Tooltip: function MockTooltip() {
    return null;
  },
  ReferenceLine: function MockReferenceLine() {
    return <div data-testid="reference-line" />;
  },
}));

const sampleData = [
  { week: '2026-01-05', score: 0.5, documentCount: 10 },
  { week: '2026-01-12', score: 1.2, documentCount: 15 },
  { week: '2026-01-19', score: 0.8, documentCount: 12 },
];

describe('TrendChart', () => {
  it('shows empty message when no data', () => {
    render(<TrendChart data={[]} baselineAvg={0.3} baselineStdDev={0.1} readingLevel="summary" />);
    expect(screen.getByText('No trend data available.')).toBeDefined();
  });

  it('renders the chart container with data', () => {
    render(
      <TrendChart
        data={sampleData}
        baselineAvg={0.3}
        baselineStdDev={0.1}
        readingLevel="summary"
      />,
    );
    expect(screen.getByTestId('responsive-container')).toBeDefined();
    expect(screen.getByTestId('composed-chart')).toBeDefined();
  });

  it('shows legend in detailed mode', () => {
    render(
      <TrendChart
        data={sampleData}
        baselineAvg={0.3}
        baselineStdDev={0.1}
        readingLevel="detailed"
      />,
    );
    expect(screen.getByText('Decay-weighted score')).toBeDefined();
    expect(screen.getByText('Baseline avg')).toBeDefined();
  });

  it('hides legend in summary mode', () => {
    render(
      <TrendChart
        data={sampleData}
        baselineAvg={0.3}
        baselineStdDev={0.1}
        readingLevel="summary"
      />,
    );
    expect(screen.queryByText('Decay-weighted score')).toBeNull();
  });

  it('hides cycle annotation when cycle year matches baseline', () => {
    // getCurrentCycleYear() returns 2 for Feb 2026, PRIMARY_BASELINE_CYCLE_YEAR = 2
    // They match, so annotation should not show.
    render(
      <TrendChart
        data={sampleData}
        baselineAvg={0.3}
        baselineStdDev={0.1}
        readingLevel="summary"
      />,
    );
    expect(screen.queryByText(/Cycle context/)).toBeNull();
  });
});
