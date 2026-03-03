import Link from 'next/link';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export interface WeekNavigatorProps {
  availableWeeks: string[];
  selectedWeek: string | null;
  onWeekChange: (week: string) => void;
  weekDetailHref?: string;
}

export function WeekNavigator({
  availableWeeks,
  selectedWeek,
  onWeekChange,
  weekDetailHref,
}: WeekNavigatorProps) {
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
      {weekDetailHref && (
        <Link
          href={weekDetailHref}
          className="text-[11px] text-dm-muted hover:text-dm-accent transition-colors ml-1"
        >
          View Week Details &rarr;
        </Link>
      )}
    </div>
  );
}
