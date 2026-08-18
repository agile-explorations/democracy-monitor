import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignificantWeeksList } from '@/components/overview/SignificantWeeksList';

describe('SignificantWeeksList', () => {
  it("shows each week's Departure Score so significance is anchored to the chart", () => {
    render(
      <SignificantWeeksList
        weeks={[
          {
            weekOf: '2025-04-28',
            reasons: [{ type: 'peak_concern', detail: 'Peak concern: 12 of 14 categories' }],
            headline: null,
            rank: 1,
            concernScore: 26,
          },
        ]}
      />,
    );
    expect(screen.getByText(/Departure Score 26/)).toBeDefined();
  });

  it('omits the score when unavailable', () => {
    render(
      <SignificantWeeksList
        weeks={[
          {
            weekOf: '2025-04-28',
            reasons: [{ type: 'peak_concern', detail: 'Peak' }],
            headline: null,
            rank: 1,
            concernScore: null,
          },
        ]}
      />,
    );
    expect(screen.queryByText(/Departure Score/)).toBeNull();
  });
});

describe('recent-first ordering with event badges (#585 follow-up)', () => {
  it('sorts newest first regardless of stored rank, and badges the event type', () => {
    render(
      <SignificantWeeksList
        weeks={[
          {
            weekOf: '2025-04-28',
            reasons: [{ type: 'peak_concern', detail: 'Peak concern: 12 of 14' }],
            headline: null,
            rank: 1,
            concernScore: 26,
          },
          {
            weekOf: '2026-06-08',
            reasons: [{ type: 'new_concern', detail: 'Five entered' }],
            headline: null,
            rank: 2,
            concernScore: 25,
          },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Jun 8, 2026');
    expect(items[1].textContent).toContain('Apr 28, 2025');
    expect(screen.getByText('Term peak')).toBeDefined();
    expect(screen.getByText('New concerns')).toBeDefined();
    expect(screen.getByText(/most recent first/)).toBeDefined();
  });
});
