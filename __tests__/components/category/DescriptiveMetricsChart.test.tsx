import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DescriptiveMetricsChart } from '@/components/category/DescriptiveMetricsChart';

// Mock recharts to avoid rendering canvas in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: function MockResponsiveContainer({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return <div data-testid="responsive-container">{children}</div>;
  },
  LineChart: function MockLineChart({ children }: { children: React.ReactNode }) {
    return <div data-testid="line-chart">{children}</div>;
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
  Legend: function MockLegend() {
    return null;
  },
  ReferenceLine: function MockReferenceLine() {
    return <div data-testid="reference-line" />;
  },
  Brush: function MockBrush() {
    return null;
  },
}));

const sampleData = [
  {
    weekOf: '2025-01-06',
    totalSeverity: 10,
    documentCount: 5,
    avgSeverityPerDoc: 2,
    structuralScore: 45,
    aiScore: 20,
    thematicScore: 30,
    convergenceScore: 0,
    convergenceDetail: null,
  },
  {
    weekOf: '2025-01-13',
    totalSeverity: 15,
    documentCount: 8,
    avgSeverityPerDoc: 1.875,
    structuralScore: 55,
    aiScore: 35,
    thematicScore: 40,
    convergenceScore: 1,
    convergenceDetail: null,
  },
];

describe('DescriptiveMetricsChart', () => {
  const defaultProps = {
    data: sampleData,
    mode: 'light' as const,
    onRangeChange: vi.fn(),
    selectedWeek: null,
    onWeekClick: vi.fn(),
  };

  it('renders chart with three metric lines', () => {
    render(<DescriptiveMetricsChart {...defaultProps} />);
    expect(screen.getByTestId('line-chart')).toBeDefined();
    expect(screen.getByTestId('line-structural')).toBeDefined();
    expect(screen.getByTestId('line-ai')).toBeDefined();
    expect(screen.getByTestId('line-thematic')).toBeDefined();
  });

  it('shows empty state when no data', () => {
    render(<DescriptiveMetricsChart {...defaultProps} data={[]} />);
    expect(screen.getByText('No metrics data available.')).toBeDefined();
  });

  it('renders selected week reference line', () => {
    render(<DescriptiveMetricsChart {...defaultProps} selectedWeek="2025-01-06" />);
    expect(screen.getByTestId('reference-line')).toBeDefined();
  });

  it('does not render reference line when no week selected', () => {
    render(<DescriptiveMetricsChart {...defaultProps} />);
    expect(screen.queryByTestId('reference-line')).toBeNull();
  });
});
