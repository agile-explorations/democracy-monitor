import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WeekMap } from '@/lib/services/concern-service';
import {
  computeConvergenceSeries,
  fetchWeeklyConvergenceData,
} from '@/lib/services/concern-service';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
}));

// The function uses INFRASTRUCTURE_THEMES from lib/data/infrastructure-keywords.ts
// which has 3 themes: detention, surveillance, criminalization — each with activationThreshold: 2

describe('computeConvergenceSeries', () => {
  it('returns empty array for empty weekMap', () => {
    const weekMap: WeekMap = new Map();
    expect(computeConvergenceSeries(weekMap)).toEqual([]);
  });

  it('returns "none" when no themes are activated', () => {
    const weekMap: WeekMap = new Map([
      ['2025-02-03', [{ category: 'judicialIndependence', reason: 'routine update', matches: [] }]],
    ]);
    const result = computeConvergenceSeries(weekMap);
    expect(result).toHaveLength(1);
    expect(result[0].convergence).toBe('none');
    expect(result[0].activeThemeCount).toBe(0);
    expect(result[0].convergenceScore).toBe(0);
  });

  it('returns "emerging" when exactly one theme is activated', () => {
    // detention theme needs activationThreshold=2, so provide 2 keyword matches
    const weekMap: WeekMap = new Map([
      [
        '2025-02-03',
        [
          {
            category: 'immigration',
            reason: 'detention facility expansion',
            matches: ['detention center'],
          },
          { category: 'immigration', reason: 'private prison contracts', matches: ['CoreCivic'] },
        ],
      ],
    ]);
    const result = computeConvergenceSeries(weekMap);
    expect(result).toHaveLength(1);
    expect(result[0].convergence).toBe('emerging');
    expect(result[0].activeThemeCount).toBe(1);
  });

  it('returns "active" when two themes activated with low convergence score', () => {
    const weekMap: WeekMap = new Map([
      [
        '2025-02-03',
        [
          // detention: 2 keyword matches (>= threshold 2)
          { category: 'immigration', reason: 'detention facility', matches: ['detention center'] },
          // surveillance: 2 keyword matches (>= threshold 2)
          {
            category: 'civilLiberties',
            reason: 'mass surveillance',
            matches: ['facial recognition'],
          },
        ],
      ],
    ]);
    const result = computeConvergenceSeries(weekMap);
    expect(result).toHaveLength(1);
    expect(result[0].convergence).toBe('active');
    expect(result[0].activeThemeCount).toBe(2);
    expect(result[0].convergenceScore).toBeGreaterThan(0);
  });

  it('returns "entrenched" when convergence score is high enough', () => {
    // Need convergenceScore >= 50 (CONVERGENCE_ENTRENCHED_THRESHOLD)
    // Score = product of active intensities when >= 2 active
    // Need many keyword hits across multiple themes
    const entries = [];
    // Lots of detention keywords
    for (let i = 0; i < 10; i++) {
      entries.push({
        category: 'immigration',
        reason: 'detention facility mass detention detention center',
        matches: ['detention capacity', 'private prison', 'CoreCivic', 'detention beds'],
      });
    }
    // Lots of surveillance keywords
    for (let i = 0; i < 10; i++) {
      entries.push({
        category: 'civilLiberties',
        reason: 'mass surveillance facial recognition biometric database',
        matches: ['surveillance technology', 'predictive policing', 'cell-site simulator'],
      });
    }
    const weekMap: WeekMap = new Map([['2025-02-03', entries]]);
    const result = computeConvergenceSeries(weekMap);
    expect(result).toHaveLength(1);
    expect(result[0].convergence).toBe('entrenched');
    expect(result[0].convergenceScore).toBeGreaterThanOrEqual(50);
  });

  it('sorts weeks chronologically', () => {
    const weekMap: WeekMap = new Map([
      ['2025-02-10', [{ category: 'judicialIndependence', reason: 'update', matches: [] }]],
      ['2025-01-27', [{ category: 'judicialIndependence', reason: 'update', matches: [] }]],
      ['2025-02-03', [{ category: 'judicialIndependence', reason: 'update', matches: [] }]],
    ]);
    const result = computeConvergenceSeries(weekMap);
    expect(result.map((r) => r.week)).toEqual(['2025-01-27', '2025-02-03', '2025-02-10']);
  });

  it('computes independent convergence per week', () => {
    const weekMap: WeekMap = new Map([
      // Week 1: no themes
      ['2025-01-27', [{ category: 'judicialIndependence', reason: 'routine', matches: [] }]],
      // Week 2: detention theme active
      [
        '2025-02-03',
        [
          { category: 'immigration', reason: 'detention facility', matches: ['detention center'] },
          { category: 'immigration', reason: 'mass detention', matches: ['private prison'] },
        ],
      ],
    ]);
    const result = computeConvergenceSeries(weekMap);
    expect(result).toHaveLength(2);
    expect(result[0].convergence).toBe('none');
    expect(result[1].convergence).toBe('emerging');
  });

  it('convergenceScore is 0 when only one theme has non-zero intensity', () => {
    // Only detention keywords, no surveillance/criminalization keywords
    // activeIntensities will have length 1 (only detention > 0)
    // So convergenceScore should be 0
    const weekMap: WeekMap = new Map([
      [
        '2025-02-03',
        [
          {
            category: 'immigration',
            reason: 'detention facility',
            matches: ['detention center'],
          },
        ],
      ],
    ]);
    const result = computeConvergenceSeries(weekMap);
    expect(result).toHaveLength(1);
    // Only 1 intensity > 0, so convergenceScore = 0
    expect(result[0].convergenceScore).toBe(0);
  });

  it('handles all three themes activated simultaneously', () => {
    const weekMap: WeekMap = new Map([
      [
        '2025-02-03',
        [
          // detention theme (>= 2 matches)
          { category: 'immigration', reason: 'detention facility', matches: ['detention center'] },
          // surveillance theme (>= 2 matches)
          {
            category: 'civilLiberties',
            reason: 'mass surveillance',
            matches: ['facial recognition'],
          },
          // criminalization theme (>= 2 matches)
          {
            category: 'civilLiberties',
            reason: 'political prosecution',
            matches: ['selective prosecution'],
          },
        ],
      ],
    ]);
    const result = computeConvergenceSeries(weekMap);
    expect(result).toHaveLength(1);
    expect(result[0].activeThemeCount).toBe(3);
    // All three intensities > 0, convergenceScore = product of all 3
    expect(result[0].convergenceScore).toBeGreaterThan(0);
  });
});

describe('fetchWeeklyConvergenceData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds convergence points from DB rows with to parameter', async () => {
    const { getDb } = await import('@/lib/db');
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [
        {
          category: 'judicialIndependence',
          week: '2025-02-03T00:00:00.000Z',
          status: 'none',
          reason: 'routine update',
          matches: [],
        },
      ],
    });
    vi.mocked(getDb).mockReturnValue({ execute: mockExecute } as never);

    const result = await fetchWeeklyConvergenceData('2025-01-01', '2025-03-01');
    expect(result).toHaveLength(1);
    expect(result[0].week).toBe('2025-02-03');
    expect(result[0].convergence).toBe('none');
  });

  it('handles rows where matches is not an array', async () => {
    const { getDb } = await import('@/lib/db');
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [
        {
          category: 'immigration',
          week: '2025-02-03T00:00:00.000Z',
          status: 'elevated',
          reason: 'detention facility',
          matches: 'not-an-array', // non-array matches value
        },
      ],
    });
    vi.mocked(getDb).mockReturnValue({ execute: mockExecute } as never);

    const result = await fetchWeeklyConvergenceData('2025-01-01');
    expect(result).toHaveLength(1);
    // matches should be treated as empty array when not an array
  });

  it('groups multiple rows into the same week', async () => {
    const { getDb } = await import('@/lib/db');
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [
        {
          category: 'immigration',
          week: '2025-02-03T00:00:00.000Z',
          status: 'none',
          reason: 'detention facility',
          matches: ['detention center'],
        },
        {
          category: 'civilLiberties',
          week: '2025-02-03T00:00:00.000Z',
          status: 'none',
          reason: 'mass surveillance',
          matches: ['facial recognition'],
        },
      ],
    });
    vi.mocked(getDb).mockReturnValue({ execute: mockExecute } as never);

    const result = await fetchWeeklyConvergenceData('2025-01-01');
    expect(result).toHaveLength(1);
    // Two entries in same week
  });

  it('calls DB without toClause when to is not provided', async () => {
    const { getDb } = await import('@/lib/db');
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockReturnValue({ execute: mockExecute } as never);

    const result = await fetchWeeklyConvergenceData('2025-01-01');
    expect(result).toEqual([]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
