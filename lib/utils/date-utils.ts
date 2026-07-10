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
  // UTC arithmetic throughout: 'YYYY-MM-DD' parses as UTC midnight, and local
  // setDate() would shift the instant by ±1h across DST transitions — enough
  // to drift the date after ISO truncation (#534: week anchors drifted a day
  // per transition; week windows shrank to 6 days across spring-forward).
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
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

/** Return Monday-aligned week starts between two weeks (exclusive of both endpoints). */
export function weeksBetween(latestWeek: string, currentWeek: string): string[] {
  const latest = new Date(latestWeek + 'T00:00:00Z');
  const current = new Date(currentWeek + 'T00:00:00Z');
  const weeks: string[] = [];

  const week = new Date(latest);
  week.setUTCDate(week.getUTCDate() + 7);

  while (week < current) {
    weeks.push(toDateString(week));
    week.setUTCDate(week.getUTCDate() + 7);
  }

  return weeks;
}

/** Split a date range into week-sized chunks (Monday-aligned). */
export function getWeekRanges(from: string, to: string): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  // Snap to the Monday of the starting week
  const monday = new Date(getMonday(new Date(from)) + 'T00:00:00Z');
  const current = new Date(monday);
  const endDate = new Date(to);

  while (current <= endDate) {
    const weekEnd = new Date(current);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const actualEnd = weekEnd > endDate ? endDate : weekEnd;

    ranges.push({
      start: toDateString(current),
      end: toDateString(actualEnd),
    });

    current.setUTCDate(current.getUTCDate() + 7);
  }

  return ranges;
}
