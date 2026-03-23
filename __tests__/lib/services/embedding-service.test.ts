import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  computeCentroid,
  isTokenLimitError,
} from '@/lib/services/embedding-service';

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

describe('isTokenLimitError', () => {
  it('returns true for OpenAI token limit errors', () => {
    const err = Object.assign(
      new Error(
        "This model's maximum context length is 8192 tokens, however you requested 10070 tokens",
      ),
      { status: 400 },
    );
    expect(isTokenLimitError(err)).toBe(true);
  });

  it('returns true for OpenAI input length errors', () => {
    const err = Object.assign(
      new Error("Invalid 'input[1]': maximum input length is 8192 tokens."),
      { status: 400 },
    );
    expect(isTokenLimitError(err)).toBe(true);
  });

  it('returns false for other 400 errors', () => {
    const err = Object.assign(new Error('Invalid API key'), { status: 400 });
    expect(isTokenLimitError(err)).toBe(false);
  });

  it('returns false for 500 errors', () => {
    const err = Object.assign(new Error('maximum context length'), { status: 500 });
    expect(isTokenLimitError(err)).toBe(false);
  });

  it('returns false for non-Error objects', () => {
    expect(isTokenLimitError('maximum context length')).toBe(false);
    expect(isTokenLimitError(null)).toBe(false);
    expect(isTokenLimitError(undefined)).toBe(false);
  });
});

describe('computeCentroid', () => {
  it('returns null for empty array', () => {
    expect(computeCentroid([])).toBeNull();
  });

  it('returns the same vector for a single embedding', () => {
    const embedding = [1, 2, 3];
    expect(computeCentroid([embedding])).toEqual([1, 2, 3]);
  });

  it('computes element-wise mean of two vectors', () => {
    const a = [2, 4, 6];
    const b = [4, 6, 8];
    const centroid = computeCentroid([a, b])!;
    expect(centroid).toEqual([3, 5, 7]);
  });

  it('computes element-wise mean of three vectors', () => {
    const embeddings = [
      [3, 0, 0],
      [0, 3, 0],
      [0, 0, 3],
    ];
    const centroid = computeCentroid(embeddings)!;
    expect(centroid).toEqual([1, 1, 1]);
  });

  it('handles negative values', () => {
    const a = [-1, 2, -3];
    const b = [1, -2, 3];
    const centroid = computeCentroid([a, b])!;
    expect(centroid).toEqual([0, 0, 0]);
  });

  it('handles high-dimensional vectors', () => {
    const dim = 1536; // OpenAI embedding dimension
    const a = new Array(dim).fill(1);
    const b = new Array(dim).fill(3);
    const centroid = computeCentroid([a, b])!;
    expect(centroid.length).toBe(dim);
    expect(centroid[0]).toBe(2);
    expect(centroid[dim - 1]).toBe(2);
  });
});
