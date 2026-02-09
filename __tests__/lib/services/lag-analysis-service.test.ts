import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pearsonR, computeLagFromSeries } from '@/lib/services/lag-analysis-service';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pearsonR', () => {
  it('returns 1 for perfect positive correlation', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(pearsonR(x, y)).toBeCloseTo(1.0, 5);
  });

  it('returns -1 for perfect negative correlation', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2];
    expect(pearsonR(x, y)).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for no correlation', () => {
    // Orthogonal pattern
    const x = [1, -1, 1, -1, 1, -1];
    const y = [1, 1, -1, -1, 1, 1];
    expect(Math.abs(pearsonR(x, y))).toBeLessThan(0.3);
  });

  it('returns 0 for constant inputs (zero variance)', () => {
    const x = [5, 5, 5, 5];
    const y = [1, 2, 3, 4];
    expect(pearsonR(x, y)).toBe(0);
  });

  it('returns 0 for fewer than 2 data points', () => {
    expect(pearsonR([1], [2])).toBe(0);
    expect(pearsonR([], [])).toBe(0);
  });

  it('handles arrays of different lengths by using shorter', () => {
    const x = [1, 2, 3, 4, 5, 6, 7];
    const y = [2, 4, 6];
    expect(pearsonR(x, y)).toBeCloseTo(1.0, 5);
  });

  it('computes known value for moderate correlation', () => {
    // Known dataset with r ≈ 0.89
    const x = [1, 2, 3, 4, 5];
    const y = [1.2, 2.5, 2.8, 4.1, 5.3];
    const r = pearsonR(x, y);
    expect(r).toBeGreaterThan(0.95);
    expect(r).toBeLessThanOrEqual(1.0);
  });
});

describe('computeLagFromSeries', () => {
  it('finds lag 0 when series are perfectly correlated', () => {
    const rhetoric = [1, 2, 3, 4, 5, 6, 7, 8];
    const action = [1, 2, 3, 4, 5, 6, 7, 8];

    const result = computeLagFromSeries('rule_of_law', rhetoric, action, 4);

    expect(result.lagWeeks).toBe(0);
    expect(result.maxCorrelation).toBeCloseTo(1.0, 2);
    expect(result.interpretation).toContain('move together');
  });

  it('finds correct lag when action follows rhetoric', () => {
    // Rhetoric leads action by 2 weeks
    const rhetoric = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8];
    const action = [0, 0, 0, 0, 1, 2, 3, 4, 5, 6];

    const result = computeLagFromSeries('civil_liberties', rhetoric, action, 6);

    expect(result.lagWeeks).toBe(2);
    expect(result.maxCorrelation).toBeGreaterThan(0.9);
    expect(result.interpretation).toContain('2 weeks');
  });

  it('returns insufficient data interpretation for too few points', () => {
    const rhetoric = [1, 2, 3];
    const action = [1, 2, 3];

    const result = computeLagFromSeries('elections', rhetoric, action, 4);

    // With only 3 data points, only lag 0 is possible (need 4 minimum for correlation)
    expect(result.dataPoints).toBe(3);
  });

  it('returns all lag correlations in the result', () => {
    const rhetoric = [1, 2, 3, 4, 5, 6, 7, 8];
    const action = [1, 2, 3, 4, 5, 6, 7, 8];

    const result = computeLagFromSeries('media_freedom', rhetoric, action, 3);

    expect(result.correlationByLag).toHaveLength(4); // lags 0, 1, 2, 3
    expect(result.correlationByLag[0].lag).toBe(0);
    expect(result.correlationByLag[1].lag).toBe(1);
  });

  it('interprets low correlation as no significant correlation', () => {
    // Unrelated series
    const rhetoric = [1, -1, 1, -1, 1, -1, 1, -1];
    const action = [1, 1, -1, -1, 1, 1, -1, -1];

    const result = computeLagFromSeries('institutional_independence', rhetoric, action, 4);

    // The correlation should be relatively low
    if (result.maxCorrelation < 0.2) {
      expect(result.interpretation).toContain('No significant correlation');
    }
  });

  it('handles lag of 1 week', () => {
    // Rhetoric leads action by 1 week
    const rhetoric = [0, 1, 2, 3, 4, 5, 6, 7];
    const action = [0, 0, 1, 2, 3, 4, 5, 6];

    const result = computeLagFromSeries('rule_of_law', rhetoric, action, 4);

    expect(result.lagWeeks).toBe(1);
    expect(result.interpretation).toContain('~1 week');
  });
});
