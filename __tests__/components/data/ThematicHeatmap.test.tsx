import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThematicHeatmap } from '@/components/data/ThematicHeatmap';
import type { ThematicHeatmapRow } from '@/lib/types/overview';

vi.mock('next/router', () => ({
  useRouter: () => ({ asPath: '/', push: vi.fn() }),
}));

function makeRow(
  category: string,
  title: string,
  weeks: Array<Partial<ThematicHeatmapRow['weeks'][number]>>,
): ThematicHeatmapRow {
  return {
    category,
    title,
    weeks: weeks.map((w) => ({
      week: w.week ?? '2025-02-03',
      zScore: w.zScore ?? null,
      centroidDistance: w.centroidDistance ?? null,
      novelDocRate: w.novelDocRate ?? null,
      varianceRatio: w.varianceRatio ?? null,
      crossAdminDistance: w.crossAdminDistance ?? null,
      bootstrap: w.bootstrap ?? false,
    })),
  };
}

const sampleRows: ThematicHeatmapRow[] = [
  makeRow('civilService', 'Government Worker Protections', [
    {
      week: '2025-02-03',
      zScore: 1.5,
      centroidDistance: 0.12,
      novelDocRate: 0.2,
      varianceRatio: 1.1,
      crossAdminDistance: 0.3,
    },
    {
      week: '2025-02-10',
      zScore: -0.5,
      centroidDistance: 0.05,
      novelDocRate: 0.1,
      varianceRatio: 0.8,
      crossAdminDistance: null,
      bootstrap: true,
    },
  ]),
];

describe('ThematicHeatmap', () => {
  it('renders empty state when no rows', () => {
    render(<ThematicHeatmap rows={[]} mode="light" />);
    expect(screen.getByText('No thematic data available.')).toBeDefined();
  });

  it('renders metric selector tabs', () => {
    render(<ThematicHeatmap rows={sampleRows} mode="light" />);
    expect(screen.getByText('z-Score')).toBeDefined();
    expect(screen.getByText('Novel Doc Rate')).toBeDefined();
    expect(screen.getByText('Variance Ratio')).toBeDefined();
  });

  it('renders category title as link', () => {
    render(<ThematicHeatmap rows={sampleRows} mode="light" />);
    const link = screen.getByText('Government Worker Protections');
    expect(link.closest('a')).toBeDefined();
  });

  it('renders heatmap table structure', () => {
    render(<ThematicHeatmap rows={sampleRows} mode="light" />);
    const table = screen.getByRole('table');
    expect(table).toBeDefined();
    expect(table.getAttribute('aria-label')).toBe('Thematic drift heatmap');
  });

  it('switches metric on tab click', () => {
    render(<ThematicHeatmap rows={sampleRows} mode="light" />);
    const tab = screen.getByText('Novel Doc Rate');
    fireEvent.click(tab);
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('calls onCellClick when provided', () => {
    const onClick = vi.fn();
    render(<ThematicHeatmap rows={sampleRows} mode="light" onCellClick={onClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders in dark mode', () => {
    render(<ThematicHeatmap rows={sampleRows} mode="dark" />);
    expect(screen.getByRole('table')).toBeDefined();
  });

  it('renders bootstrap legend item', () => {
    render(<ThematicHeatmap rows={sampleRows} mode="light" />);
    expect(screen.getByText('Bootstrap')).toBeDefined();
  });
});
