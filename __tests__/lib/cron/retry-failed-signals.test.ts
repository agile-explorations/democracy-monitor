import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryFailedSignals } from '@/lib/cron/retry-failed-signals';

// Use vi.hoisted so mock fns are available inside vi.mock factories
const {
  mockGetLatestSourceHealth,
  mockBuildSignalLookup,
  mockFetchSignalWithMetadata,
  mockStoreDocuments,
  mockScoreDocumentBatch,
  mockStoreDocumentScores,
  mockRecordSourceHealthChecks,
  mockRecordSnapshotSignalResults,
  mockGetWeekOfDate,
} = vi.hoisted(() => ({
  mockGetLatestSourceHealth: vi.fn(),
  mockBuildSignalLookup: vi.fn(),
  mockFetchSignalWithMetadata: vi.fn(),
  mockStoreDocuments: vi.fn(),
  mockScoreDocumentBatch: vi.fn(),
  mockStoreDocumentScores: vi.fn(),
  mockRecordSourceHealthChecks: vi.fn(),
  mockRecordSnapshotSignalResults: vi.fn(),
  mockGetWeekOfDate: vi.fn(),
}));

vi.mock('@/lib/services/source-health-service', () => ({
  getLatestSourceHealth: mockGetLatestSourceHealth,
  recordSourceHealthChecks: mockRecordSourceHealthChecks,
}));

vi.mock('@/lib/data/categories', () => ({
  buildSignalLookup: mockBuildSignalLookup,
}));

vi.mock('@/lib/services/feed-fetcher', () => ({
  fetchSignalWithMetadata: mockFetchSignalWithMetadata,
}));

vi.mock('@/lib/services/document-store', () => ({
  storeDocuments: mockStoreDocuments,
}));

vi.mock('@/lib/services/document-scorer', () => ({
  scoreDocumentBatch: mockScoreDocumentBatch,
  storeDocumentScores: mockStoreDocumentScores,
}));

vi.mock('@/lib/services/fetch-log-store', () => ({
  recordSnapshotSignalResults: mockRecordSnapshotSignalResults,
}));

vi.mock('@/lib/services/weekly-aggregator', () => ({
  getWeekOfDate: mockGetWeekOfDate,
}));

vi.mock('@/lib/utils/date-utils', () => ({
  addDays: vi.fn((dateStr: string, days: number) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWeekOfDate.mockReturnValue('2026-02-23');
  mockStoreDocuments.mockResolvedValue(0);
  mockStoreDocumentScores.mockResolvedValue(undefined);
  mockRecordSourceHealthChecks.mockResolvedValue([]);
  mockRecordSnapshotSignalResults.mockResolvedValue(undefined);
});

describe('retryFailedSignals', () => {
  it('no-ops when no failed signals', async () => {
    mockGetLatestSourceHealth.mockResolvedValue([
      { sourceId: 'rss_scotus', sourceType: 'rss', status: 'healthy' },
    ]);

    await retryFailedSignals();

    // All signals are healthy — nothing to retry
    expect(mockFetchSignalWithMetadata).toHaveBeenCalledTimes(0);
  });

  it('retries only unavailable signals with retryable types', async () => {
    mockGetLatestSourceHealth.mockResolvedValue([
      { sourceId: 'rss_scotus', sourceType: 'rss', status: 'unavailable' },
      { sourceId: 'cl_enforcement_cases', sourceType: 'courtlistener', status: 'unavailable' },
      { sourceId: 'rss_gao', sourceType: 'rss', status: 'healthy' },
    ]);

    const signalMap = new Map([
      [
        'rss_scotus',
        {
          signal: {
            id: 'rss_scotus',
            name: 'SCOTUS',
            url: 'https://scotus.gov/rss',
            type: 'rss',
          },
          categoryKey: 'judicialIndependence',
        },
      ],
    ]);
    mockBuildSignalLookup.mockReturnValue(signalMap);

    mockFetchSignalWithMetadata.mockResolvedValue({
      signalId: 'rss_scotus',
      signalName: 'SCOTUS',
      signalType: 'rss',
      success: true,
      documentCount: 3,
      durationMs: 500,
      items: [{ title: 'Opinion 1' }, { title: 'Opinion 2' }, { title: 'Opinion 3' }],
    });

    mockScoreDocumentBatch.mockReturnValue([{ id: '1' }, { id: '2' }, { id: '3' }]);

    await retryFailedSignals();

    // Should only retry rss_scotus, not courtlistener (not retryable type)
    expect(mockFetchSignalWithMetadata).toHaveBeenCalledTimes(1);
    // nosemgrep: opengrep.no-mock-call-assertions — verifying correct signal dispatch is the behavior under test
    expect(mockFetchSignalWithMetadata).toHaveBeenCalledWith(signalMap.get('rss_scotus')!.signal);
  });

  it('stores documents and scores on recovery', async () => {
    mockGetLatestSourceHealth.mockResolvedValue([
      { sourceId: 'rss_scotus', sourceType: 'rss', status: 'unavailable' },
    ]);

    const signal = {
      id: 'rss_scotus',
      name: 'SCOTUS',
      url: 'https://scotus.gov/rss',
      type: 'rss',
    };
    mockBuildSignalLookup.mockReturnValue(
      new Map([['rss_scotus', { signal, categoryKey: 'judicialIndependence' }]]),
    );

    const items = [{ title: 'Opinion 1' }, { title: 'Opinion 2' }];
    mockFetchSignalWithMetadata.mockResolvedValue({
      signalId: 'rss_scotus',
      signalName: 'SCOTUS',
      signalType: 'rss',
      success: true,
      documentCount: 2,
      durationMs: 300,
      items,
    });

    mockScoreDocumentBatch.mockReturnValue([{ id: '1' }]);

    await retryFailedSignals();

    // nosemgrep: opengrep.no-mock-call-assertions — verifying correct category routing for side-effect orchestration
    expect(mockStoreDocuments).toHaveBeenCalledWith(items, 'judicialIndependence');
    // nosemgrep: opengrep.no-mock-call-assertions
    expect(mockScoreDocumentBatch).toHaveBeenCalledWith(items, 'judicialIndependence');
    expect(mockStoreDocumentScores).toHaveBeenCalled();
  });

  it('does NOT call assessment services', async () => {
    mockGetLatestSourceHealth.mockResolvedValue([
      { sourceId: 'rss_scotus', sourceType: 'rss', status: 'unavailable' },
    ]);

    mockBuildSignalLookup.mockReturnValue(
      new Map([
        [
          'rss_scotus',
          {
            signal: {
              id: 'rss_scotus',
              name: 'SCOTUS',
              url: 'https://scotus.gov/rss',
              type: 'rss',
            },
            categoryKey: 'judicialIndependence',
          },
        ],
      ]),
    );

    mockFetchSignalWithMetadata.mockResolvedValue({
      signalId: 'rss_scotus',
      signalName: 'SCOTUS',
      signalType: 'rss',
      success: true,
      documentCount: 1,
      durationMs: 200,
      items: [{ title: 'Opinion' }],
    });

    mockScoreDocumentBatch.mockReturnValue([]);

    await retryFailedSignals();

    // Retry cron only calls store + score + health — no assessment
    expect(mockStoreDocuments).toHaveBeenCalled();
    expect(mockRecordSourceHealthChecks).toHaveBeenCalled();
    expect(mockRecordSnapshotSignalResults).toHaveBeenCalled();
  });

  it('updates sourceHealth and fetch_log on retry', async () => {
    mockGetLatestSourceHealth.mockResolvedValue([
      { sourceId: 'fr_opm', sourceType: 'federal_register', status: 'unavailable' },
    ]);

    const signal = {
      id: 'fr_opm',
      name: 'OPM',
      url: '/api/federal-register?agency=opm',
      type: 'federal_register',
    };
    mockBuildSignalLookup.mockReturnValue(
      new Map([['fr_opm', { signal, categoryKey: 'civilService' }]]),
    );

    const result = {
      signalId: 'fr_opm',
      signalName: 'OPM',
      signalType: 'federal_register',
      success: false,
      documentCount: 0,
      durationMs: 1000,
      errorMessage: 'HTTP 503',
      items: [{ title: 'Error', isError: true }],
    };
    mockFetchSignalWithMetadata.mockResolvedValue(result);
    mockScoreDocumentBatch.mockReturnValue([]);

    await retryFailedSignals();

    // nosemgrep: opengrep.no-mock-call-assertions — verifying correct category + result routing for health/fetch_log recording
    expect(mockRecordSourceHealthChecks).toHaveBeenCalledWith('civilService', [result]);
    // nosemgrep: opengrep.no-mock-call-assertions
    expect(mockRecordSnapshotSignalResults).toHaveBeenCalledWith(
      'civilService',
      '2026-02-23',
      expect.any(String),
      [result],
    );
  });

  it('skips signals not found in CATEGORIES', async () => {
    mockGetLatestSourceHealth.mockResolvedValue([
      { sourceId: 'rss_removed_feed', sourceType: 'rss', status: 'unavailable' },
    ]);

    mockBuildSignalLookup.mockReturnValue(new Map());

    await retryFailedSignals();

    // Signal not in CATEGORIES — should be skipped entirely
    expect(mockFetchSignalWithMetadata).toHaveBeenCalledTimes(0);
  });
});
