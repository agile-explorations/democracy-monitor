import { formatWeekLabel } from '@/lib/utils/date-utils';

export interface WeekNavigatorProps {
  availableWeeks: string[];
  selectedWeek: string | null;
  onWeekChange: (week: string) => void;
}

export function WeekNavigator({ availableWeeks, selectedWeek, onWeekChange }: WeekNavigatorProps) {
  const currentIndex = selectedWeek
    ? availableWeeks.indexOf(selectedWeek)
    : availableWeeks.length - 1;
  const atStart = currentIndex <= 0;
  const atEnd = currentIndex >= availableWeeks.length - 1;
  const displayWeek = selectedWeek ?? availableWeeks[availableWeeks.length - 1];

  if (!displayWeek) return null;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => !atStart && onWeekChange(availableWeeks[currentIndex - 1])}
        disabled={atStart}
        className="text-dm-text-secondary hover:text-dm-accent disabled:text-dm-muted disabled:cursor-default transition-colors text-xs px-1 py-0.5"
        aria-label="Previous week"
      >
        ◀
      </button>
      <span className="text-[11px] text-dm-text-secondary tabular-nums min-w-[48px] text-center">
        {formatWeekLabel(displayWeek)}
      </span>
      <button
        onClick={() => !atEnd && onWeekChange(availableWeeks[currentIndex + 1])}
        disabled={atEnd}
        className="text-dm-text-secondary hover:text-dm-accent disabled:text-dm-muted disabled:cursor-default transition-colors text-xs px-1 py-0.5"
        aria-label="Next week"
      >
        ▶
      </button>
    </div>
  );
}
