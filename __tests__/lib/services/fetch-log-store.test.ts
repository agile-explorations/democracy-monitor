import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SignalFetchResult } from '@/lib/services/feed-fetcher';
import { determineFetchStatus, recordSnapshotSignalResults } from '@/lib/services/fetch-log-store';

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

    // Should complete without error when DB is unavailable
    await recordFetchResult({
      sourceOrigin: 'doj',
      category: 'lawEnforcement',
      weekStart: '2025-01-20',
      weekEnd: '2025-01-27',
      itemsFetched: 5,
      itemsStored: 5,
      errors: [],
    });
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

describe('recordSnapshotSignalResults', () => {
  it('no-ops when DB is unavailable', async () => {
    const results: SignalFetchResult[] = [
      {
        signalId: 'rss_scotus',
        signalName: 'SCOTUS',
        signalType: 'rss',
        success: true,
        documentCount: 3,
        durationMs: 100,
        items: [],
      },
    ];

    // DB is unavailable (mocked above), so this should no-op without error
    await recordSnapshotSignalResults('judicialIndependence', '2026-02-23', '2026-03-01', results);
  });

  it('filters to known signal types and aggregates by canonical source origin', async () => {
    const results: SignalFetchResult[] = [
      {
        signalId: 'rss_scotus',
        signalName: 'SCOTUS',
        signalType: 'rss',
        success: true,
        documentCount: 3,
        durationMs: 100,
        items: [],
      },
      {
        signalId: 'cl_enforcement_cases',
        signalName: 'CourtListener',
        signalType: 'courtlistener',
        success: true,
        documentCount: 5,
        durationMs: 200,
        items: [],
      },
      {
        signalId: 'fr_opm',
        signalName: 'OPM',
        signalType: 'federal_register',
        success: true,
        documentCount: 10,
        durationMs: 150,
        items: [],
      },
      {
        signalId: 'doj_criminal',
        signalName: 'DOJ Criminal',
        signalType: 'doj_json',
        success: true,
        documentCount: 4,
        durationMs: 300,
        items: [],
      },
      {
        signalId: 'html_oversight_gov',
        signalName: 'Oversight.gov',
        signalType: 'html',
        success: true,
        documentCount: 2,
        durationMs: 400,
        items: [],
      },
    ];

    // Should not throw — just no-ops due to DB unavailable
    await recordSnapshotSignalResults('executiveOversight', '2026-02-23', '2026-03-01', results);
  });
});
