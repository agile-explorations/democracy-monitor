import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StructuralHeatmap } from '@/components/data/StructuralHeatmap';
import type { StructuralHeatmapRow } from '@/lib/types/overview';

const sampleRows: StructuralHeatmapRow[] = [
  {
    category: 'civilService',
    title: 'Government Worker Protections',
    weeks: [
      {
        week: '2026-01-06',
        dimensions: {
          volume: 1.5,
          typeComposition: -0.3,
          functionalDistribution: 0.8,
          agencyActivity: 0.2,
          publicationTempo: 1.0,
          sourceConvergence: null,
        },
        composite: 2.0,
        anomalous: false,
      },
      {
        week: '2026-01-13',
        dimensions: {
          volume: 3.2,
          typeComposition: 1.1,
          functionalDistribution: 2.5,
          agencyActivity: 0.9,
          publicationTempo: 1.8,
          sourceConvergence: 0.5,
        },
        composite: 3.5,
        anomalous: true,
      },
    ],
  },
  {
    category: 'fiscal',
    title: 'Fiscal Controls',
    weeks: [
      {
        week: '2026-01-06',
        dimensions: {},
        composite: null,
        anomalous: false,
      },
      {
        week: '2026-01-13',
        dimensions: { volume: 0.5 },
        composite: 0.8,
        anomalous: false,
      },
    ],
  },
];

describe('StructuralHeatmap', () => {
  it('renders empty message when no rows', () => {
    render(<StructuralHeatmap rows={[]} mode="light" />);
    expect(screen.getByText('No structural data available.')).toBeDefined();
  });

  it('renders category labels as links', () => {
    render(<StructuralHeatmap rows={sampleRows} mode="light" />);
    expect(screen.getByTitle('Government Worker Protections')).toBeDefined();
    expect(screen.getByTitle('Fiscal Controls')).toBeDefined();
    // Row labels should be links
    const links = screen.getAllByRole('rowheader');
    expect(links).toHaveLength(2);
  });

  it('renders correct number of cells', () => {
    const { container } = render(<StructuralHeatmap rows={sampleRows} mode="light" />);
    const cells = container.querySelectorAll('[role="cell"]');
    // 2 rows x 2 weeks = 4 cells
    expect(cells).toHaveLength(4);
  });

  it('shows dimension selector with composite selected by default', () => {
    render(<StructuralHeatmap rows={sampleRows} mode="light" />);
    const compositeTab = screen.getByRole('tab', { name: 'Composite' });
    expect(compositeTab.getAttribute('aria-selected')).toBe('true');
  });

  it('changes displayed dimension when selector is clicked', () => {
    const { container } = render(<StructuralHeatmap rows={sampleRows} mode="light" />);

    // Click "Volume" tab
    fireEvent.click(screen.getByRole('tab', { name: 'Volume' }));
    expect(screen.getByRole('tab', { name: 'Volume' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Composite' }).getAttribute('aria-selected')).toBe(
      'false',
    );

    // Cells should still render
    const cells = container.querySelectorAll('[role="cell"]');
    expect(cells).toHaveLength(4);
  });

  it('renders tooltip with all dimension z-scores', () => {
    render(<StructuralHeatmap rows={sampleRows} mode="light" />);
    // Check tooltip content for first cell of first row
    const cells = screen.getAllByRole('cell');
    const tooltip = cells[0].getAttribute('title') ?? '';
    expect(tooltip).toContain('Government Worker Protections');
    expect(tooltip).toContain('Composite: 2.00');
    expect(tooltip).toContain('Volume: 1.50');
    expect(tooltip).toContain('Source Convergence: N/A');
  });

  it('renders gradient legend', () => {
    render(<StructuralHeatmap rows={sampleRows} mode="light" />);
    expect(screen.getByText('quieter than baseline')).toBeDefined();
    expect(screen.getByText('busier than baseline')).toBeDefined();
    expect(screen.getByText('z-score −4 to +4')).toBeDefined();
  });

  it('renders in dark mode without errors', () => {
    render(<StructuralHeatmap rows={sampleRows} mode="dark" />);
    expect(screen.getByTitle('Government Worker Protections')).toBeDefined();
  });

  it('uses no-data pattern for null composite', () => {
    const { container } = render(<StructuralHeatmap rows={sampleRows} mode="light" />);
    const cells = container.querySelectorAll('[role="cell"]');
    // fiscal row, first week has null composite — should have background pattern
    const fiscalFirstCell = cells[2] as HTMLElement;
    expect(fiscalFirstCell.style.background).toContain('url(');
  });
});

describe('methodology-change markers (#576)', () => {
  it('renders a marker with tooltip when an instrument change falls in a rendered week', () => {
    // 2026-02-02 hosts the CourtListener collection change (non-retroactive —
    // the only class of change that marks the axis).
    const rows = [
      {
        category: 'military',
        title: 'Using Military Inside the U.S.',
        weeks: [
          { week: '2026-01-26', dimensions: {}, composite: 0.5, anomalous: false },
          { week: '2026-02-02', dimensions: {}, composite: 0.5, anomalous: false },
        ],
      },
    ] as any;
    render(<StructuralHeatmap rows={rows} mode="light" />);
    expect(screen.getByText('Collection changes')).toBeDefined();
    const marker = screen.getByLabelText(/Data collection change in week of/);
    expect(marker.getAttribute('title')).toContain('how court records are collected');
  });

  it('renders no marker row when no changes fall in range', () => {
    const rows = [
      {
        category: 'military',
        title: 'Using Military Inside the U.S.',
        weeks: [{ week: '2025-05-05', dimensions: {}, composite: 0.5, anomalous: false }],
      },
    ] as any;
    render(<StructuralHeatmap rows={rows} mode="light" />);
    expect(screen.queryByText('Collection changes')).toBeNull();
  });
});
