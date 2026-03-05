import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb } from '@/lib/db';
import {
  convergenceStatusAtLeast,
  getWeekMonday,
  runBacktest,
} from '@/lib/validation/historical-backtest';
import type { KnownEvent } from '@/lib/validation/known-events';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
}));

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('convergenceStatusAtLeast', () => {
  it('returns true when actual equals threshold', () => {
    expect(convergenceStatusAtLeast('Elevated', 'Elevated')).toBe(true);
    expect(convergenceStatusAtLeast('Divergent', 'Divergent')).toBe(true);
    expect(convergenceStatusAtLeast('ConfirmedConcern', 'ConfirmedConcern')).toBe(true);
  });

  it('returns true when actual is above threshold', () => {
    expect(convergenceStatusAtLeast('Divergent', 'Elevated')).toBe(true);
    expect(convergenceStatusAtLeast('ConfirmedConcern', 'Elevated')).toBe(true);
    expect(convergenceStatusAtLeast('ConfirmedConcern', 'Divergent')).toBe(true);
  });

  it('returns false when actual is below threshold', () => {
    expect(convergenceStatusAtLeast('Stable', 'Elevated')).toBe(false);
    expect(convergenceStatusAtLeast('Elevated', 'Divergent')).toBe(false);
    expect(convergenceStatusAtLeast('Divergent', 'ConfirmedConcern')).toBe(false);
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
      id: 'T1-1',
      date: '2017-01-27',
      category: 'civilLiberties',
      description: 'Travel ban EO',
      period: 'trump_t1',
      expectedMinStatus: 'Elevated',
    },
    {
      id: 'T1-2',
      date: '2017-05-09',
      category: 'judicialIndependence',
      description: 'Comey firing',
      period: 'trump_t1',
      expectedMinStatus: 'Divergent',
    },
  ];

  function mockDb(rows: Array<Record<string, unknown>>) {
    const db = {
      execute: vi.fn().mockResolvedValueOnce({ rows }),
    };
    mockGetDb.mockReturnValue(db as ReturnType<typeof getDb>);
    return db;
  }

  it('detects event when week status meets expected severity', async () => {
    mockDb([
      {
        category: 'civilLiberties',
        week_of: '2017-01-23',
        total_severity: 8.5,
        status: 'Elevated',
        structural_score: 3.0,
        ai_score: 2.0,
        thematic_score: null,
      },
    ]);

    const results = await runBacktest('2017-01-20', '2017-06-01', [EVENTS[0]]);
    expect(results).toHaveLength(1);
    expect(results[0].detectedEvents).toHaveLength(1);
    expect(results[0].missedEvents).toHaveLength(0);
    expect(results[0].detectionRate).toBe(1);
  });

  it('marks event as missed when week status is below expected severity', async () => {
    mockDb([
      {
        category: 'judicialIndependence',
        week_of: '2017-05-08',
        total_severity: 2.0,
        status: 'Elevated',
        structural_score: null,
        ai_score: null,
        thematic_score: null,
      },
    ]);

    const results = await runBacktest('2017-01-20', '2017-06-01', [EVENTS[1]]);
    expect(results).toHaveLength(1);
    expect(results[0].detectedEvents).toHaveLength(0);
    expect(results[0].missedEvents).toHaveLength(1);
    expect(results[0].detectionRate).toBe(0);
  });

  it('counts false alarms for weeks with Divergent+ but no known event', async () => {
    mockDb([
      {
        category: 'civilLiberties',
        week_of: '2017-01-23',
        total_severity: 8.5,
        status: 'Elevated',
        structural_score: 3.0,
        ai_score: 2.0,
        thematic_score: null,
      },
      {
        category: 'civilLiberties',
        week_of: '2017-02-06',
        total_severity: 10.0,
        status: 'Divergent',
        structural_score: 4.0,
        ai_score: 3.0,
        thematic_score: 4.0,
      },
    ]);

    const results = await runBacktest('2017-01-20', '2017-03-01', [EVENTS[0]]);
    expect(results[0].falseAlarms).toBe(1);
  });

  it('handles empty data gracefully', async () => {
    mockDb([]);

    const results = await runBacktest('2017-01-20', '2017-06-01', EVENTS);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.weeklyScores).toHaveLength(0);
      expect(r.detectionRate).toBe(0);
      expect(r.falseAlarms).toBe(0);
    }
  });

  it('computes detection rate correctly with mixed results', async () => {
    const events: KnownEvent[] = [
      {
        id: 'T1-1',
        date: '2017-01-27',
        category: 'civilLiberties',
        description: 'Event 1',
        period: 'trump_t1',
        expectedMinStatus: 'Elevated',
      },
      {
        id: 'T1-1',
        date: '2017-03-06',
        category: 'civilLiberties',
        description: 'Event 2',
        period: 'trump_t1',
        expectedMinStatus: 'Elevated',
      },
    ];

    mockDb([
      {
        category: 'civilLiberties',
        week_of: '2017-01-23',
        total_severity: 8.0,
        status: 'Elevated',
        structural_score: 3.0,
        ai_score: 2.0,
        thematic_score: null,
      },
      {
        category: 'civilLiberties',
        week_of: '2017-03-06',
        total_severity: 3.0,
        status: 'Stable',
        structural_score: null,
        ai_score: null,
        thematic_score: null,
      },
    ]);

    const results = await runBacktest('2017-01-20', '2017-06-01', events);
    expect(results[0].detectedEvents).toHaveLength(1);
    expect(results[0].missedEvents).toHaveLength(1);
    expect(results[0].detectionRate).toBe(0.5);
  });

  it('includes layer scores in weekly data', async () => {
    mockDb([
      {
        category: 'civilLiberties',
        week_of: '2017-01-23',
        total_severity: 8.5,
        status: 'Elevated',
        structural_score: 3.1,
        ai_score: 2.5,
        thematic_score: 4.2,
      },
    ]);

    const results = await runBacktest('2017-01-20', '2017-06-01', [EVENTS[0]]);
    const week = results[0].weeklyScores[0];
    expect(week.structuralScore).toBe(3.1);
    expect(week.aiScore).toBe(2.5);
    expect(week.thematicScore).toBe(4.2);
  });
});
