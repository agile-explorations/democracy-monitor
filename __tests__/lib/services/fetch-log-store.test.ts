import { describe, it, expect, vi, beforeEach } from 'vitest';
import { determineFetchStatus } from '@/lib/services/fetch-log-store';

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(false),
  getDb: vi.fn(),
}));

describe('determineFetchStatus', () => {
  it('returns complete when no errors', () => {
    expect(determineFetchStatus(5, 0)).toBe('complete');
  });

  it('returns complete when zero items and zero errors (legitimately empty week)', () => {
    expect(determineFetchStatus(0, 0)).toBe('complete');
  });

  it('returns partial when items and errors both present', () => {
    expect(determineFetchStatus(3, 1)).toBe('partial');
  });

  it('returns failed when errors but no items', () => {
    expect(determineFetchStatus(0, 2)).toBe('failed');
  });

  it('returns failed with single error and no items', () => {
    expect(determineFetchStatus(0, 1)).toBe('failed');
  });

  it('returns partial with many items and one error', () => {
    expect(determineFetchStatus(100, 1)).toBe('partial');
  });
});

describe('recordFetchResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops when DB is unavailable', async () => {
    const { recordFetchResult } = await import('@/lib/services/fetch-log-store');
    const { getDb } = await import('@/lib/db');

    await recordFetchResult({
      sourceOrigin: 'doj',
      category: 'lawEnforcement',
      weekStart: '2025-01-20',
      weekEnd: '2025-01-27',
      itemsFetched: 5,
      itemsStored: 5,
      errors: [],
    });

    expect(getDb).not.toHaveBeenCalled();
  });
});

describe('getCompletedWeekStarts', () => {
  it('returns empty set when DB is unavailable', async () => {
    const { getCompletedWeekStarts } = await import('@/lib/services/fetch-log-store');
    const result = await getCompletedWeekStarts('doj', 'lawEnforcement');
    expect(result).toEqual(new Set());
  });
});

describe('getIncompleteWeeks', () => {
  it('returns empty array when DB is unavailable', async () => {
    const { getIncompleteWeeks } = await import('@/lib/services/fetch-log-store');
    const result = await getIncompleteWeeks('doj', 'lawEnforcement');
    expect(result).toEqual([]);
  });
});
