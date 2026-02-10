import { describe, it, expect } from 'vitest';
import type { WeekMap } from '@/lib/services/convergence-service';
import { computeConvergenceSeries } from '@/lib/services/convergence-service';

// The function uses INFRASTRUCTURE_THEMES from lib/data/infrastructure-keywords.ts
// which has 3 themes: detention, surveillance, criminalization — each with activationThreshold: 2

describe('computeConvergenceSeries', () => {
  it('returns empty array for empty weekMap', () => {
    const weekMap: WeekMap = new Map();
    expect(computeConvergenceSeries(weekMap)).toEqual([]);
  });

  it('returns "none" when no themes are activated', () => {
    const weekMap: WeekMap = new Map([
      ['2025-02-03', [{ category: 'courts', reason: 'routine update', matches: [] }]],
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
      ['2025-02-10', [{ category: 'courts', reason: 'update', matches: [] }]],
      ['2025-01-27', [{ category: 'courts', reason: 'update', matches: [] }]],
      ['2025-02-03', [{ category: 'courts', reason: 'update', matches: [] }]],
    ]);
    const result = computeConvergenceSeries(weekMap);
    expect(result.map((r) => r.week)).toEqual(['2025-01-27', '2025-02-03', '2025-02-10']);
  });

  it('computes independent convergence per week', () => {
    const weekMap: WeekMap = new Map([
      // Week 1: no themes
      ['2025-01-27', [{ category: 'courts', reason: 'routine', matches: [] }]],
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
});
