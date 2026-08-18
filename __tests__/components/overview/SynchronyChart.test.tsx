import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SynchronyChart } from '@/components/overview/SynchronyChart';
import type { SynchronyPoint } from '@/lib/types/overview';

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
  Area: function MockArea({ dataKey }: { dataKey: string }) {
    return <div data-testid={`area-${dataKey}`} />;
  },
  Line: function MockLine({ dataKey }: { dataKey: string }) {
    return <div data-testid={`line-${dataKey}`} />;
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
  Brush: function MockBrush() {
    return null;
  },
  ReferenceLine: function MockReferenceLine() {
    return null;
  },
}));

const sampleData: SynchronyPoint[] = [
  {
    week: '2026-01-06',
    elevatedCount: 2,
    weightedScore: 3,
    elevatedWeighted: 1,
    confirmedWeighted: 2,
  },
  {
    week: '2026-01-13',
    elevatedCount: 4,
    weightedScore: 7,
    elevatedWeighted: 1,
    confirmedWeighted: 6,
  },
  {
    week: '2026-01-20',
    elevatedCount: 1,
    weightedScore: 1,
    elevatedWeighted: 1,
    confirmedWeighted: 0,
  },
];

describe('SynchronyChart', () => {
  it('renders empty message when no data', () => {
    render(<SynchronyChart data={[]} mode="light" readingLevel="summary" />);
    expect(screen.getByText('No status data available.')).toBeDefined();
  });

  it('renders composed chart with data in summary mode', () => {
    render(<SynchronyChart data={sampleData} mode="light" readingLevel="summary" />);
    expect(screen.getByTestId('responsive-container')).toBeDefined();
    expect(screen.getByTestId('composed-chart')).toBeDefined();
    // Summary shows single weightedScore area + trend line
    expect(screen.getByTestId('area-weightedScore')).toBeDefined();
    expect(screen.getByTestId('line-trend')).toBeDefined();
  });

  it('renders stacked areas in detailed mode', () => {
    render(<SynchronyChart data={sampleData} mode="light" readingLevel="detailed" />);
    expect(screen.getByTestId('area-elevatedWeighted')).toBeDefined();
    expect(screen.getByTestId('area-confirmedWeighted')).toBeDefined();
    expect(screen.getByTestId('line-trend')).toBeDefined();
  });

  it('renders legend with Departure Score in summary mode', () => {
    render(<SynchronyChart data={sampleData} mode="light" readingLevel="summary" />);
    expect(screen.getByText('Departure Score')).toBeDefined();
    expect(screen.getByText('Trend Lines:')).toBeDefined();
    expect(screen.getByText('Trump T2')).toBeDefined();
  });

  it('renders legend with status levels in detailed mode', () => {
    render(<SynchronyChart data={sampleData} mode="light" readingLevel="detailed" />);
    expect(screen.getByText('Notable departure (1 pt)')).toBeDefined();
    expect(screen.getByText('Sustained departure (2 pts)')).toBeDefined();
    expect(screen.getByText('Trend Lines:')).toBeDefined();
    expect(screen.getByText('Trump T2')).toBeDefined();
  });

  it('renders in dark mode without errors', () => {
    render(<SynchronyChart data={sampleData} mode="dark" readingLevel="summary" />);
    expect(screen.getByTestId('composed-chart')).toBeDefined();
  });

  it('does not render comparison lines by default when no comparison data', () => {
    render(<SynchronyChart data={sampleData} mode="light" readingLevel="summary" />);
    expect(screen.queryByTestId('line-trumpT1Trend')).toBeNull();
    expect(screen.queryByTestId('line-bidenT1Trend')).toBeNull();
  });

  it('hides comparison legend entries when no comparison data exists', () => {
    render(<SynchronyChart data={sampleData} mode="light" readingLevel="summary" />);
    expect(screen.queryByText('Trump T1')).toBeNull();
    expect(screen.queryByText('Biden T1')).toBeNull();
  });

  it('always renders comparison lines and legend when comparison data exists', () => {
    const dataWithComparison: SynchronyPoint[] = sampleData.map((d, i) => ({
      ...d,
      trumpT1Trend: i + 1,
      bidenT1Trend: i + 2,
    }));
    render(<SynchronyChart data={dataWithComparison} mode="light" readingLevel="summary" />);

    // No toggle button — comparisons are always on (user feedback 2026-07-25)
    expect(screen.queryByText('Compare Previous Administrations')).toBeNull();

    expect(screen.getByTestId('line-trumpT1Trend')).toBeDefined();
    expect(screen.getByTestId('line-bidenT1Trend')).toBeDefined();
    expect(screen.getByText('Trump T1')).toBeDefined();
    expect(screen.getByText('Biden T1')).toBeDefined();
  });
});
