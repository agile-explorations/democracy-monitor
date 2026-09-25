/** One day in milliseconds. */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** One week in milliseconds. */
export const ONE_WEEK_MS = 7 * ONE_DAY_MS;

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

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
/** "September 14, 2026" · "Sept. 13" · "Sep 14, 2026" · "Aug. 3rd, 2026" — capitalised
 *  month (so "may 30 days" is not a date), optional period, day, optional year. */
const MONTH_NAME_DATE =
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?![\d:])/g;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;

export interface ParsedDate {
  /** The date as written. */
  raw: string;
  /** YYYY-MM-DD. */
  iso: string;
}

function isoIfValid(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return toDateString(d);
}

/** Every calendar date written in `text` (R-CREC-SPEAKERS #931): month-name forms
 *  with or without a year (a missing year takes `defaultYear`, or the date is
 *  skipped), ISO and M/D/YYYY. Fiscal years, bare years and ranges of years are
 *  not dates. UTC throughout (the #534 rule). */
export function parseDatesInText(text: string, defaultYear?: number): ParsedDate[] {
  const out: ParsedDate[] = [];
  const push = (raw: string, iso: string | null) => {
    if (iso) out.push({ raw, iso });
  };
  for (const m of text.matchAll(MONTH_NAME_DATE)) {
    const year = m[3] ? Number(m[3]) : defaultYear;
    if (year === undefined) continue;
    push(m[0].trim(), isoIfValid(year, MONTH_INDEX[m[1].toLowerCase()], Number(m[2])));
  }
  for (const m of text.matchAll(ISO_DATE))
    push(m[0], isoIfValid(Number(m[1]), Number(m[2]), Number(m[3])));
  for (const m of text.matchAll(SLASH_DATE))
    push(m[0], isoIfValid(Number(m[3]), Number(m[1]), Number(m[2])));
  return out;
}
