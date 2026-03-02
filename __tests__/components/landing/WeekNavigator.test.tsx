import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { WeekNavigator } from '@/components/landing/WeekNavigator';

const weeks = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'];

/** Stateful wrapper so we can test navigation via rendered output. */
function StatefulNavigator({ initial }: { initial: string }) {
  const [selected, setSelected] = useState(initial);
  return (
    <WeekNavigator availableWeeks={weeks} selectedWeek={selected} onWeekChange={setSelected} />
  );
}

describe('WeekNavigator', () => {
  it('renders the selected week label', () => {
    render(
      <WeekNavigator availableWeeks={weeks} selectedWeek="2026-01-19" onWeekChange={() => {}} />,
    );
    expect(screen.getByText('Jan 19')).toBeDefined();
  });

  it('defaults to last week when selectedWeek is null', () => {
    render(<WeekNavigator availableWeeks={weeks} selectedWeek={null} onWeekChange={() => {}} />);
    expect(screen.getByText('Jan 26')).toBeDefined();
  });

  it('navigates to previous week when prev clicked', () => {
    render(<StatefulNavigator initial="2026-01-19" />);
    expect(screen.getByText('Jan 19')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Previous week'));
    expect(screen.getByText('Jan 12')).toBeDefined();
  });

  it('navigates to next week when next clicked', () => {
    render(<StatefulNavigator initial="2026-01-19" />);
    expect(screen.getByText('Jan 19')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Next week'));
    expect(screen.getByText('Jan 26')).toBeDefined();
  });

  it('disables prev button at start', () => {
    render(
      <WeekNavigator availableWeeks={weeks} selectedWeek="2026-01-05" onWeekChange={() => {}} />,
    );
    expect(screen.getByLabelText('Previous week').hasAttribute('disabled')).toBe(true);
  });

  it('disables next button at end', () => {
    render(
      <WeekNavigator availableWeeks={weeks} selectedWeek="2026-01-26" onWeekChange={() => {}} />,
    );
    expect(screen.getByLabelText('Next week').hasAttribute('disabled')).toBe(true);
  });

  it('returns null when no weeks available', () => {
    const { container } = render(
      <WeekNavigator availableWeeks={[]} selectedWeek={null} onWeekChange={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
