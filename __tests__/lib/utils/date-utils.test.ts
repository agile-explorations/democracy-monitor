import { describe, it, expect, vi, afterEach } from 'vitest';
import { toDateString, scotusTermYear, getWeekRanges } from '@/lib/utils/date-utils';

describe('toDateString', () => {
  it('extracts YYYY-MM-DD from a Date', () => {
    expect(toDateString(new Date('2025-03-15T12:30:00Z'))).toBe('2025-03-15');
  });

  it('zero-pads month and day', () => {
    expect(toDateString(new Date('2025-01-05T00:00:00Z'))).toBe('2025-01-05');
  });
});

describe('scotusTermYear', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns current year (2-digit) when month is October or later', () => {
    vi.useFakeTimers();
    // November 2025 -> term started Oct 2025 -> "25"
    vi.setSystemTime(new Date('2025-11-01T00:00:00Z'));
    expect(scotusTermYear()).toBe('25');
  });

  it('returns previous year (2-digit) when month is before October', () => {
    vi.useFakeTimers();
    // March 2026 -> term started Oct 2025 -> "25"
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
    expect(scotusTermYear()).toBe('25');
  });

  it('returns current year in October itself', () => {
    vi.useFakeTimers();
    // October 2024 -> term started Oct 2024 -> "24"
    vi.setSystemTime(new Date('2024-10-15T00:00:00Z'));
    expect(scotusTermYear()).toBe('24');
  });

  it('returns previous year in September', () => {
    vi.useFakeTimers();
    // September 2025 -> term started Oct 2024 -> "24"
    vi.setSystemTime(new Date('2025-09-15T00:00:00Z'));
    expect(scotusTermYear()).toBe('24');
  });
});

describe('getWeekRanges', () => {
  it('returns a single range for a span of 6 days or fewer', () => {
    const ranges = getWeekRanges('2025-01-01', '2025-01-05');
    expect(ranges).toEqual([{ start: '2025-01-01', end: '2025-01-05' }]);
  });

  it('returns a single range for exactly 7 days', () => {
    const ranges = getWeekRanges('2025-01-01', '2025-01-07');
    expect(ranges).toEqual([{ start: '2025-01-01', end: '2025-01-07' }]);
  });

  it('splits multi-week ranges into 7-day chunks', () => {
    const ranges = getWeekRanges('2025-01-01', '2025-01-21');
    expect(ranges).toEqual([
      { start: '2025-01-01', end: '2025-01-07' },
      { start: '2025-01-08', end: '2025-01-14' },
      { start: '2025-01-15', end: '2025-01-21' },
    ]);
  });

  it('clamps the final partial week to the end date', () => {
    const ranges = getWeekRanges('2025-01-01', '2025-01-10');
    expect(ranges).toEqual([
      { start: '2025-01-01', end: '2025-01-07' },
      { start: '2025-01-08', end: '2025-01-10' },
    ]);
  });

  it('returns a single-day range when start equals end', () => {
    const ranges = getWeekRanges('2025-06-15', '2025-06-15');
    expect(ranges).toEqual([{ start: '2025-06-15', end: '2025-06-15' }]);
  });
});
