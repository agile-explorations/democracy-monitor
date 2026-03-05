/** One day in milliseconds. */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** One week in milliseconds. */
export const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/** Six months (180 days) in milliseconds. */
export const SIX_MONTHS_MS = 180 * ONE_DAY_MS;

/** Extract YYYY-MM-DD from a Date object. */
export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Supreme Court term starts each October. TYear = 2-digit year the term began. */
export function scotusTermYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return String(year % 100);
}

/** Get the Monday of the week for a given Date. Returns YYYY-MM-DD. */
export function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return toDateString(d);
}

/**
 * The latest week with complete data (previous Monday).
 * The current in-progress week is excluded because convergence hasn't run yet.
 */
export function latestCompleteWeek(): string {
  const now = new Date();
  const thisMonday = getMonday(now);
  const d = new Date(thisMonday + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 7);
  return toDateString(d);
}

/** Add days to a date string. Returns YYYY-MM-DD. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

/** Format a week date string (YYYY-MM-DD) as a short label like "Jan 27". */
export function formatWeekLabel(week: string): string {
  const d = new Date(week + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Mar 2, 2025" — includes year for tooltip disambiguation. */
export function formatWeekLabelWithYear(week: string): string {
  const d = new Date(week + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Split a date range into week-sized chunks (Monday-aligned). */
export function getWeekRanges(from: string, to: string): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  const current = new Date(from);
  const endDate = new Date(to);

  while (current <= endDate) {
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const actualEnd = weekEnd > endDate ? endDate : weekEnd;

    ranges.push({
      start: toDateString(current),
      end: toDateString(actualEnd),
    });

    current.setDate(current.getDate() + 7);
  }

  return ranges;
}
