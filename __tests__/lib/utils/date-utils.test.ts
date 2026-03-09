import { describe, it, expect } from 'vitest';
import { toDateString, getWeekRanges, formatWeekLabel } from '@/lib/utils/date-utils';

describe('toDateString', () => {
  it('extracts YYYY-MM-DD from a Date', () => {
    expect(toDateString(new Date('2025-03-15T12:30:00Z'))).toBe('2025-03-15');
  });

  it('zero-pads month and day', () => {
    expect(toDateString(new Date('2025-01-05T00:00:00Z'))).toBe('2025-01-05');
  });
});

describe('formatWeekLabel', () => {
  it('formats a date string as "Mon DD"', () => {
    expect(formatWeekLabel('2025-01-27')).toBe('Jan 27');
  });

  it('formats month correctly for mid-year', () => {
    expect(formatWeekLabel('2025-07-14')).toBe('Jul 14');
  });

  it('formats single-digit days without leading zero', () => {
    expect(formatWeekLabel('2025-03-03')).toBe('Mar 3');
  });

  it('handles December dates', () => {
    expect(formatWeekLabel('2025-12-25')).toBe('Dec 25');
  });
});

describe('getWeekRanges', () => {
  it('Monday-aligns the start date', () => {
    // 2025-01-01 is a Wednesday → snaps back to Monday 2024-12-30
    const ranges = getWeekRanges('2025-01-01', '2025-01-05');
    expect(ranges).toEqual([{ start: '2024-12-30', end: '2025-01-05' }]);
  });

  it('keeps Monday start dates unchanged', () => {
    // 2025-01-06 is already a Monday
    const ranges = getWeekRanges('2025-01-06', '2025-01-12');
    expect(ranges).toEqual([{ start: '2025-01-06', end: '2025-01-12' }]);
  });

  it('splits multi-week ranges into Monday-aligned 7-day chunks', () => {
    // 2025-01-06 (Mon) through 2025-01-26 (Sun) = 3 full weeks
    const ranges = getWeekRanges('2025-01-06', '2025-01-26');
    expect(ranges).toEqual([
      { start: '2025-01-06', end: '2025-01-12' },
      { start: '2025-01-13', end: '2025-01-19' },
      { start: '2025-01-20', end: '2025-01-26' },
    ]);
  });

  it('clamps the final partial week to the end date', () => {
    const ranges = getWeekRanges('2025-01-06', '2025-01-15');
    expect(ranges).toEqual([
      { start: '2025-01-06', end: '2025-01-12' },
      { start: '2025-01-13', end: '2025-01-15' },
    ]);
  });

  it('handles inauguration dates (Friday → snaps to Monday)', () => {
    // 2017-01-20 is a Friday → snaps to Monday 2017-01-16
    const ranges = getWeekRanges('2017-01-20', '2017-01-29');
    expect(ranges[0].start).toBe('2017-01-16');
    expect(ranges).toHaveLength(2);
  });

  it('returns a single-day range when start equals end (Monday)', () => {
    const ranges = getWeekRanges('2025-06-16', '2025-06-16');
    expect(ranges).toEqual([{ start: '2025-06-16', end: '2025-06-16' }]);
  });
});
