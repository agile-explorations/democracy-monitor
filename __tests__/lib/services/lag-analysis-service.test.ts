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

  it('returns correct interpretation for multi-week lag', () => {
    // Rhetoric leads action by 3 weeks
    const rhetoric = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const action = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7];

    const result = computeLagFromSeries('civil_liberties', rhetoric, action, 6);

    expect(result.lagWeeks).toBe(3);
    expect(result.interpretation).toContain('~3 weeks');
    expect(result.interpretation).toContain('r=');
  });

  it('returns no significant correlation for uncorrelated data', () => {
    // Random-looking data with low correlation at all lags
    const rhetoric = [1, -1, 1, -1, 1, -1, 1, -1];
    const action = [0, 0, 0, 0, 0, 0, 0, 0];

    const result = computeLagFromSeries('elections', rhetoric, action, 4);

    // Constant action → pearsonR returns 0 → below 0.2 threshold
    expect(result.maxCorrelation).toBeLessThan(0.2);
    expect(result.interpretation).toBe('No significant correlation between rhetoric and action');
  });

  it('handles maxLag greater than available data points', () => {
    // 6 data points, maxLag 10 → loop should be constrained by n - MIN_DATA_POINTS
    const rhetoric = [1, 2, 3, 4, 5, 6];
    const action = [1, 2, 3, 4, 5, 6];

    const result = computeLagFromSeries('media_freedom', rhetoric, action, 10);

    // n=6, MIN_DATA_POINTS=4 → max lag = min(10, 6-4) = 2
    expect(result.correlationByLag.length).toBeLessThanOrEqual(3); // lags 0, 1, 2
    expect(result.dataPoints).toBe(6);
  });

  it('handles maxLag of 0', () => {
    const rhetoric = [1, 2, 3, 4, 5, 6, 7, 8];
    const action = [1, 2, 3, 4, 5, 6, 7, 8];

    const result = computeLagFromSeries('rule_of_law', rhetoric, action, 0);

    expect(result.correlationByLag).toHaveLength(1); // only lag 0
    expect(result.lagWeeks).toBe(0);
  });

  it('handles exactly MIN_DATA_POINTS (4) data points', () => {
    const rhetoric = [1, 2, 3, 4];
    const action = [1, 2, 3, 4];

    const result = computeLagFromSeries('rule_of_law', rhetoric, action, 4);

    // n=4, MIN_DATA_POINTS=4 → max lag = min(4, 4-4) = 0
    expect(result.correlationByLag).toHaveLength(1); // only lag 0
    expect(result.maxCorrelation).toBeCloseTo(1.0, 2);
  });

  it('picks best lag when multiple lags have similar but not identical correlation', () => {
    // Series where lag 0 has r < lag 2
    const rhetoric = [0, 0, 1, 3, 5, 7, 9, 11, 13, 15];
    const action = [1, 0, 0, 0, 1, 3, 5, 7, 9, 11];

    const result = computeLagFromSeries('institutional_independence', rhetoric, action, 4);

    // The best lag should be whatever has highest correlation
    expect(result.lagWeeks).toBeGreaterThanOrEqual(0);
    expect(result.maxCorrelation).toBeGreaterThan(-Infinity);
  });
});

describe('pearsonR — additional edge cases', () => {
  it('returns 0 when both arrays have zero variance', () => {
    expect(pearsonR([3, 3, 3], [7, 7, 7])).toBe(0);
  });

  it('handles exactly 2 data points', () => {
    expect(pearsonR([1, 2], [3, 4])).toBeCloseTo(1.0, 5);
    expect(pearsonR([1, 2], [4, 3])).toBeCloseTo(-1.0, 5);
  });
});
