import { describe, it, expect } from 'vitest';
import { roundTo, mean, stddev } from '@/lib/utils/math';

describe('roundTo', () => {
  it('rounds to 0 decimal places', () => {
    expect(roundTo(3.7, 0)).toBe(4);
  });

  it('rounds to 2 decimal places', () => {
    expect(roundTo(3.14159, 2)).toBe(3.14);
  });

  it('rounds up at midpoint', () => {
    expect(roundTo(2.555, 2)).toBe(2.56);
  });

  it('handles negative numbers', () => {
    expect(roundTo(-1.555, 2)).toBe(-1.55);
  });

  it('handles zero', () => {
    expect(roundTo(0, 3)).toBe(0);
  });
});

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the value for single-element array', () => {
    expect(mean([42])).toBe(42);
  });

  it('calculates the arithmetic mean of multiple values', () => {
    expect(mean([2, 4, 6])).toBe(4);
  });

  it('handles negative values', () => {
    expect(mean([-10, 10])).toBe(0);
  });

  it('handles decimal values', () => {
    expect(mean([1.5, 2.5])).toBe(2);
  });
});

describe('stddev', () => {
  it('returns 0 for empty array', () => {
    expect(stddev([])).toBe(0);
  });

  it('returns 0 for single-element array', () => {
    expect(stddev([5])).toBe(0);
  });

  it('calculates sample standard deviation for two values', () => {
    // [0, 2]: mean=1, variance = ((0-1)^2 + (2-1)^2) / 1 = 2, stddev = sqrt(2)
    expect(stddev([0, 2])).toBeCloseTo(Math.SQRT2, 10);
  });

  it('calculates sample standard deviation for multiple values', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9]: mean=5, sample stddev ~= 2.138
    const result = stddev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result).toBeCloseTo(2.138, 2);
  });

  it('returns 0 for identical values', () => {
    expect(stddev([3, 3, 3, 3])).toBe(0);
  });
});
