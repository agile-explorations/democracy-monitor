import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusTimeline } from '@/components/overview/StatusTimeline';
import type { StatusTimelineEntry } from '@/lib/types/overview';

const sampleEntries: StatusTimelineEntry[] = [
  {
    category: 'civilService',
    title: 'Government Worker Protections',
    segments: [
      { week: '2026-01-06', status: 'Stable' },
      { week: '2026-01-13', status: 'Elevated' },
    ],
  },
  {
    category: 'fiscal',
    title: 'Fiscal Controls',
    segments: [
      { week: '2026-01-06', status: 'Divergent' },
      { week: '2026-01-13', status: 'ConfirmedConcern' },
    ],
  },
];

describe('StatusTimeline', () => {
  it('renders empty message when no entries', () => {
    render(<StatusTimeline entries={[]} mode="light" />);
    expect(screen.getByText('No timeline data available.')).toBeDefined();
  });

  it('renders category labels', () => {
    render(<StatusTimeline entries={sampleEntries} mode="light" />);
    expect(screen.getByTitle('Government Worker Protections')).toBeDefined();
    expect(screen.getByTitle('Fiscal Controls')).toBeDefined();
  });

  it('renders correct number of segment cells', () => {
    const { container } = render(<StatusTimeline entries={sampleEntries} mode="light" />);
    const cells = container.querySelectorAll('[role="cell"]');
    // 2 entries x 2 weeks = 4 cells
    expect(cells).toHaveLength(4);
  });

  it('includes status label in cell title', () => {
    render(<StatusTimeline entries={sampleEntries} mode="light" />);
    expect(screen.getByTitle(/Fiscal Controls — Jan 13: Confirmed Concern/)).toBeDefined();
  });

  it('renders in dark mode without errors', () => {
    render(<StatusTimeline entries={sampleEntries} mode="dark" />);
    expect(screen.getByTitle('Government Worker Protections')).toBeDefined();
  });
});
