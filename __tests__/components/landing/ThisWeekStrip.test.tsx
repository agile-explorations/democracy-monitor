import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  deriveNotableCondition,
  tallyCurrentWeekStatuses,
  ThisWeekStrip,
} from '@/components/landing/ThisWeekStrip';
import type { ConcernLevel } from '@/lib/types';
import type { FetchWeekHealth } from '@/lib/types/overview';

const mockReadingLevel = vi.hoisted(() => ({ level: 'summary' as string }));
vi.mock('@/lib/contexts/ReadingLevelContext', () => ({
  useReadingLevel: () => ({ readingLevel: mockReadingLevel.level }),
}));
vi.mock('@/lib/contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedMode: 'dark' }),
}));

function cat(status: ConcernLevel | null) {
  return { convergenceStatus: status };
}

function week(weekStr: string, failed: number): FetchWeekHealth {
  return { week: weekStr, total: 10, complete: 10 - failed, partial: 0, failed };
}

const SYNCHRONY = [
  {
    week: '2026-06-22',
    elevatedCount: 1,
    weightedScore: 3,
    elevatedWeighted: 1,
    confirmedWeighted: 1,
  },
  {
    week: '2026-06-29',
    elevatedCount: 2,
    weightedScore: 5,
    elevatedWeighted: 1,
    confirmedWeighted: 2,
  },
];

describe('tallyCurrentWeekStatuses', () => {
  it('counts by status and skips nulls', () => {
    const counts = tallyCurrentWeekStatuses([
      cat('Stable'),
      cat('Stable'),
      cat('Elevated'),
      cat(null),
    ]);
    expect(counts.Stable).toBe(2);
    expect(counts.Elevated).toBe(1);
    expect(counts.ConfirmedConcern).toBeUndefined();
  });
});

describe('deriveNotableCondition', () => {
  it('reports a trailing data-gap streak with ordinal', () => {
    const timeline = [week('w1', 0), week('w2', 1), week('w3', 2), week('w4', 1)];
    expect(deriveNotableCondition(timeline, [], null)).toBe('3rd consecutive week with data gaps');
  });

  it('reports a single gap week without a streak framing', () => {
    const timeline = [week('w1', 0), week('w2', 1)];
    expect(deriveNotableCondition(timeline, [], null)).toBe('Data gaps this week');
  });

  it('falls back to the significant-week headline for the current week', () => {
    const sig = [{ weekOf: '2026-06-29', reasons: [], headline: 'Court defies order', rank: 1 }];
    expect(deriveNotableCondition([week('w1', 0)], sig, '2026-06-29')).toBe('Court defies order');
  });

  it('returns null when nothing is notable', () => {
    expect(deriveNotableCondition([week('w1', 0)], [], '2026-06-29')).toBeNull();
  });
});

describe('ThisWeekStrip', () => {
  const baseProps = {
    weekOf: '2026-06-29',
    isLatestWeek: true,
    categories: [cat('Stable'), cat('Stable'), cat('Elevated'), cat('ConfirmedConcern')],
    synchrony: SYNCHRONY,
    fetchTimeline: [week('2026-06-29', 0)],
    significantWeeks: [],
  };

  it('renders week label, status counts in severity order, and jump links', () => {
    render(<ThisWeekStrip {...baseProps} />);
    expect(screen.getByText(/Jun 29/)).toBeDefined();
    expect(screen.getByText('Sustained departure')).toBeDefined();
    expect(screen.getByText('Notable departure')).toBeDefined();
    expect(screen.getByText('Consistent with baseline')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Trend' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Term so far' })).toBeDefined();
  });

  it('pluralizes departure counts and explains each status on hover (#732)', () => {
    render(
      <ThisWeekStrip
        {...baseProps}
        categories={[cat('Elevated'), cat('Elevated'), cat('Elevated'), cat('ConfirmedConcern')]}
      />,
    );
    const plural = screen.getByText('Notable departures');
    expect(screen.getByText('Sustained departure')).toBeDefined();
    expect(plural.closest('[title]')?.getAttribute('title')).toMatch(/second-pass review/i);
  });

  it('sparkline links to the full concern chart and highlights the viewed week', () => {
    const { container } = render(<ThisWeekStrip {...baseProps} />);
    const chartLink = screen.getByRole('link', { name: 'View full concern chart' });
    expect(chartLink.getAttribute('href')).toBe('#concern-score');
    // weekOf (2026-06-29) exists in the synchrony series → highlight dot renders
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0);
  });

  it('hides the heatmap link in summary mode and shows it in detailed mode', () => {
    mockReadingLevel.level = 'summary';
    const { unmount } = render(<ThisWeekStrip {...baseProps} />);
    expect(screen.queryByRole('link', { name: 'Heatmap' })).toBeNull();
    unmount();

    mockReadingLevel.level = 'detailed';
    render(<ThisWeekStrip {...baseProps} />);
    expect(screen.getByRole('link', { name: 'Heatmap' })).toBeDefined();
  });

  it('follows the selected week: label flips and gap-streaks are suppressed for past weeks', () => {
    const gappyTimeline = [week('w1', 1), week('w2', 2)];
    render(
      <ThisWeekStrip
        {...baseProps}
        weekOf="2026-03-09"
        isLatestWeek={false}
        fetchTimeline={gappyTimeline}
        categories={[cat('ConfirmedConcern'), cat('Stable')]}
      />,
    );
    expect(screen.getByText('Week of')).toBeDefined();
    expect(screen.getByText(/Mar 9/)).toBeDefined();
    expect(screen.getByText('Sustained departure')).toBeDefined();
    // present-tense gap streak must not describe a past week
    expect(screen.queryByText(/data gaps/i)).toBeNull();
  });

  it('shows the week headline, with the gap streak as a caveat on the latest week (#539)', () => {
    const gappyTimeline = [week('w1', 1), week('w2', 2)];
    render(
      <ThisWeekStrip
        {...baseProps}
        headline="OPM established at-will federal employment rules."
        fetchTimeline={gappyTimeline}
      />,
    );
    expect(screen.getByText(/at-will federal employment/)).toBeDefined();
    expect(screen.getByText(/2nd consecutive week with data gaps/)).toBeDefined();
  });

  it('falls back to the significant-week headline when no week headline exists (#539)', () => {
    const sig = [{ weekOf: '2026-06-29', reasons: [], headline: 'Court defies order', rank: 1 }];
    render(<ThisWeekStrip {...baseProps} significantWeeks={sig} />);
    expect(screen.getByText(/Court defies order/)).toBeDefined();
  });

  it('shows a loading placeholder while a past week fetches', () => {
    render(<ThisWeekStrip {...baseProps} isLatestWeek={false} weekLoading />);
    expect(screen.getByText('Loading…')).toBeDefined();
    expect(screen.queryByText('Elevated')).toBeNull();
  });

  it('shows a placeholder when no statuses exist yet', () => {
    render(<ThisWeekStrip {...baseProps} categories={[cat(null)]} />);
    expect(screen.getByText('No assessment yet')).toBeDefined();
  });
});
