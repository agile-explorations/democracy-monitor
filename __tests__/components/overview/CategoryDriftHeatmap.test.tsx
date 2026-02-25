import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CategoryDriftHeatmap } from '@/components/overview/CategoryDriftHeatmap';
import type { HeatmapRow } from '@/lib/types/overview';

const sampleRows: HeatmapRow[] = [
  {
    category: 'civilService',
    title: 'Government Worker Protections',
    weeks: [
      { week: '2026-01-06', score: 0.2 },
      { week: '2026-01-13', score: 0.8 },
    ],
  },
  {
    category: 'fiscal',
    title: 'Fiscal Controls',
    weeks: [
      { week: '2026-01-06', score: 0 },
      { week: '2026-01-13', score: 0.5 },
    ],
  },
];

describe('CategoryDriftHeatmap', () => {
  it('renders empty message when no rows', () => {
    render(<CategoryDriftHeatmap rows={[]} mode="light" />);
    expect(screen.getByText('No heatmap data available.')).toBeDefined();
  });

  it('renders category labels', () => {
    render(<CategoryDriftHeatmap rows={sampleRows} mode="light" />);
    expect(screen.getByTitle('Government Worker Protections')).toBeDefined();
    expect(screen.getByTitle('Fiscal Controls')).toBeDefined();
  });

  it('renders correct number of cells', () => {
    const { container } = render(<CategoryDriftHeatmap rows={sampleRows} mode="light" />);
    const cells = container.querySelectorAll('[role="cell"]');
    // 2 rows x 2 weeks = 4 cells
    expect(cells).toHaveLength(4);
  });

  it('applies background color to cells', () => {
    const { container } = render(<CategoryDriftHeatmap rows={sampleRows} mode="light" />);
    const cells = container.querySelectorAll('[role="cell"]');
    // Each cell should have a backgroundColor style
    for (const cell of cells) {
      expect((cell as HTMLElement).style.backgroundColor).toBeTruthy();
    }
  });

  it('renders in dark mode without errors', () => {
    render(<CategoryDriftHeatmap rows={sampleRows} mode="dark" />);
    expect(screen.getByTitle('Government Worker Protections')).toBeDefined();
  });

  it('includes score in cell title', () => {
    render(<CategoryDriftHeatmap rows={sampleRows} mode="light" />);
    const cell = screen.getByTitle(/Government Worker Protections — Jan 13: 0.80/);
    expect(cell).toBeDefined();
  });
});
