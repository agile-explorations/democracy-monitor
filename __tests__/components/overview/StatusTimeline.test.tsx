import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
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
    expect(screen.getByTitle(/Fiscal Controls — Jan 13: Sustained departure/)).toBeDefined();
  });

  it('hides the Not-yet-assessed legend entry when every cell has a status', () => {
    render(<StatusTimeline entries={sampleEntries} mode="light" />);
    expect(screen.queryByText('Not yet assessed')).toBeNull();
  });

  it('shows the Not-yet-assessed legend entry and cell label for null-status cells', () => {
    const withNull: StatusTimelineEntry[] = [
      {
        category: 'hatch',
        title: 'Political Campaigning Rules (Hatch Act)',
        segments: [
          { week: '2026-01-06', status: null },
          { week: '2026-01-13', status: 'Stable' },
        ],
      },
    ];
    render(<StatusTimeline entries={withNull} mode="light" />);
    expect(screen.getByText('Not yet assessed')).toBeDefined();
    expect(screen.getByTitle(/Jan 6: Not yet assessed/)).toBeDefined();
  });

  it('renders in dark mode without errors', () => {
    render(<StatusTimeline entries={sampleEntries} mode="dark" />);
    expect(screen.getByTitle('Government Worker Protections')).toBeDefined();
  });

  it('highlights header after clicking a week column', () => {
    function Wrapper() {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <StatusTimeline
          entries={sampleEntries}
          mode="light"
          selectedWeek={selected}
          onWeekHeaderClick={setSelected}
        />
      );
    }
    render(<Wrapper />);
    // Before click — header should have muted text (not selected)
    const headerBefore = screen.getByTitle('Jan 6');
    expect(headerBefore.className).toContain('text-dm-muted');
    // Click the header
    fireEvent.click(headerBefore);
    // After click — header should show accent text and font-semibold (selected state)
    expect(headerBefore.className).toContain('font-semibold');
    expect(headerBefore.className).not.toContain('text-dm-muted');
  });

  it('adds ring to data cells in selected week column', () => {
    const { container } = render(
      <StatusTimeline entries={sampleEntries} mode="light" selectedWeek="2026-01-13" />,
    );
    const cells = container.querySelectorAll('[role="cell"]');
    // Cells for week 2026-01-13 are at indices 1 and 3 (2nd cell per row)
    expect(cells[1].className).toContain('ring-2');
    expect(cells[3].className).toContain('ring-2');
    // Cells for 2026-01-06 should NOT have ring-2
    expect(cells[0].className).not.toContain('ring-2');
  });
});

describe('collection-change markers (#584)', () => {
  it('shows NO marker row for collection changes that leave statuses comparable', () => {
    // The CL rework breaks volume comparability but not status comparability
    // (content-based detection, zero-flip-gated) — status surfaces stay clean.
    const entries = [
      {
        category: 'military',
        title: 'Using Military Inside the U.S.',
        segments: [
          { week: '2026-01-26', status: 'Stable' },
          { week: '2026-02-02', status: 'Stable' },
        ],
      },
    ] as any;
    render(<StatusTimeline entries={entries} mode="light" />);
    expect(screen.queryByText('Collection changes')).toBeNull();
  });
});
