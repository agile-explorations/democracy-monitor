import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb } from '@/lib/db';
import { statusAtLeast, getWeekMonday, runBacktest } from '@/lib/validation/historical-backtest';
import type { KnownEvent } from '@/lib/validation/known-events';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
}));

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('statusAtLeast', () => {
  it('returns true when actual equals threshold', () => {
    expect(statusAtLeast('Warning', 'Warning')).toBe(true);
    expect(statusAtLeast('Drift', 'Drift')).toBe(true);
    expect(statusAtLeast('Capture', 'Capture')).toBe(true);
  });

  it('returns true when actual is above threshold', () => {
    expect(statusAtLeast('Drift', 'Warning')).toBe(true);
    expect(statusAtLeast('Capture', 'Warning')).toBe(true);
    expect(statusAtLeast('Capture', 'Drift')).toBe(true);
  });

  it('returns false when actual is below threshold', () => {
    expect(statusAtLeast('Stable', 'Warning')).toBe(false);
    expect(statusAtLeast('Warning', 'Drift')).toBe(false);
    expect(statusAtLeast('Drift', 'Capture')).toBe(false);
  });
});

describe('getWeekMonday', () => {
  it('returns same date for a Monday', () => {
    expect(getWeekMonday('2017-01-23')).toBe('2017-01-23');
  });

  it('returns previous Monday for a Wednesday', () => {
    expect(getWeekMonday('2017-01-25')).toBe('2017-01-23');
  });

  it('returns previous Monday for a Friday', () => {
    expect(getWeekMonday('2017-01-27')).toBe('2017-01-23');
  });

  it('returns previous Monday for a Sunday', () => {
    expect(getWeekMonday('2017-01-29')).toBe('2017-01-23');
  });

  it('returns previous Monday for a Saturday', () => {
    expect(getWeekMonday('2017-01-28')).toBe('2017-01-23');
  });
});

describe('runBacktest', () => {
  const EVENTS: KnownEvent[] = [
    {
      date: '2017-01-27',
      category: 'military',
      description: 'Travel ban EO',
      expectedSeverity: 'Drift',
    },
    {
      date: '2017-05-09',
      category: 'rule_of_law',
      description: 'Comey firing',
      expectedSeverity: 'Capture',
    },
  ];

  function mockDb(
    aggregateRows: Array<Record<string, unknown>>,
    assessmentRows: Array<Record<string, unknown>>,
  ) {
    const db = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({ rows: aggregateRows })
        .mockResolvedValueOnce({ rows: assessmentRows }),
    };
    mockGetDb.mockReturnValue(db as ReturnType<typeof getDb>);
    return db;
  }

  it('detects event when week status meets expected severity', async () => {
    mockDb(
      [{ category: 'military', week_of: '2017-01-23', total_severity: 8.5 }],
      [{ category: 'military', week: '2017-01-23T00:00:00.000Z', status: 'Drift' }],
    );

    const results = await runBacktest('2017-01-20', '2017-06-01', [EVENTS[0]]);
    expect(results).toHaveLength(1);
    expect(results[0].detectedEvents).toHaveLength(1);
    expect(results[0].missedEvents).toHaveLength(0);
    expect(results[0].detectionRate).toBe(1);
  });

  it('marks event as missed when week status is below expected severity', async () => {
    mockDb(
      [{ category: 'rule_of_law', week_of: '2017-05-08', total_severity: 2.0 }],
      [{ category: 'rule_of_law', week: '2017-05-08T00:00:00.000Z', status: 'Warning' }],
    );

    const results = await runBacktest('2017-01-20', '2017-06-01', [EVENTS[1]]);
    expect(results).toHaveLength(1);
    expect(results[0].detectedEvents).toHaveLength(0);
    expect(results[0].missedEvents).toHaveLength(1);
    expect(results[0].detectionRate).toBe(0);
  });

  it('counts false alarms for weeks with Drift+ but no known event', async () => {
    mockDb(
      [
        { category: 'military', week_of: '2017-01-23', total_severity: 8.5 },
        { category: 'military', week_of: '2017-02-06', total_severity: 10.0 },
      ],
      [
        { category: 'military', week: '2017-01-23T00:00:00.000Z', status: 'Drift' },
        { category: 'military', week: '2017-02-06T00:00:00.000Z', status: 'Drift' },
      ],
    );

    const results = await runBacktest('2017-01-20', '2017-03-01', [EVENTS[0]]);
    expect(results[0].falseAlarms).toBe(1);
  });

  it('handles empty data gracefully', async () => {
    mockDb([], []);

    const results = await runBacktest('2017-01-20', '2017-06-01', EVENTS);
    expect(results).toHaveLength(2); // One per unique category
    for (const r of results) {
      expect(r.weeklyScores).toHaveLength(0);
      expect(r.detectionRate).toBe(0);
      expect(r.falseAlarms).toBe(0);
    }
  });

  it('computes detection rate correctly with mixed results', async () => {
    const events: KnownEvent[] = [
      {
        date: '2017-01-27',
        category: 'military',
        description: 'Event 1',
        expectedSeverity: 'Drift',
      },
      {
        date: '2017-03-06',
        category: 'military',
        description: 'Event 2',
        expectedSeverity: 'Drift',
      },
    ];

    mockDb(
      [
        { category: 'military', week_of: '2017-01-23', total_severity: 8.0 },
        { category: 'military', week_of: '2017-03-06', total_severity: 3.0 },
      ],
      [
        { category: 'military', week: '2017-01-23T00:00:00.000Z', status: 'Drift' },
        { category: 'military', week: '2017-03-06T00:00:00.000Z', status: 'Warning' },
      ],
    );

    const results = await runBacktest('2017-01-20', '2017-06-01', events);
    expect(results[0].detectedEvents).toHaveLength(1);
    expect(results[0].missedEvents).toHaveLength(1);
    expect(results[0].detectionRate).toBe(0.5);
  });
});
