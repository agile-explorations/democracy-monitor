import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '@/lib/services/embedding-service';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('returns 0 for different-length vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('handles single-element vectors', () => {
    expect(cosineSimilarity([3], [6])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([3], [-6])).toBeCloseTo(-1, 5);
  });

  it('is symmetric', () => {
    const a = [1, 3, -2, 4];
    const b = [2, -1, 5, 3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it('handles empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('correctly computes known similarity', () => {
    // [1,0] and [1,1] should have similarity of 1/sqrt(2) ≈ 0.7071
    const a = [1, 0];
    const b = [1, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1 / Math.sqrt(2), 5);
  });

  it('is scale-invariant', () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6]; // same direction, 2x magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});
