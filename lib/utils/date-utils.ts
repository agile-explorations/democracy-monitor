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
