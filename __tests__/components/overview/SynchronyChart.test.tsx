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
  AreaChart: function MockAreaChart({ children }: { children: React.ReactNode }) {
    return <div data-testid="area-chart">{children}</div>;
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
  Brush: function MockBrush() {
    return null;
  },
}));

const sampleData: SynchronyPoint[] = [
  { week: '2026-01-06', elevatedCount: 2 },
  { week: '2026-01-13', elevatedCount: 4 },
  { week: '2026-01-20', elevatedCount: 1 },
];

describe('SynchronyChart', () => {
  it('renders empty message when no data', () => {
    render(<SynchronyChart data={[]} mode="light" />);
    expect(screen.getByText('No synchrony data available.')).toBeDefined();
  });

  it('renders chart container with data', () => {
    render(<SynchronyChart data={sampleData} mode="light" />);
    expect(screen.getByTestId('responsive-container')).toBeDefined();
    expect(screen.getByTestId('area-chart')).toBeDefined();
  });

  it('renders in dark mode without errors', () => {
    render(<SynchronyChart data={sampleData} mode="dark" />);
    expect(screen.getByTestId('area-chart')).toBeDefined();
  });
});
