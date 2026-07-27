import { describe, expect, it, vi } from 'vitest';
import {
  computeRollingThematicDrift,
  computeVarianceRatio,
  detectNovelDocuments,
} from '@/lib/services/semantic-drift-service';

// Queue of per-week embedding rows: first call = current week, then the
// rolling window weeks (loadWeekEmbeddings order in computeRollingThematicDrift).
const weekQueue: number[][][] = [];
vi.mock('@/lib/db', () => ({
  isDbAvailable: () => true,
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve((weekQueue.shift() ?? []).map((e) => ({ embedding: e }))),
      }),
    }),
  }),
}));
vi.mock('@/lib/services/baseline-service', () => ({
  getBaseline: vi.fn().mockResolvedValue(null),
}));

/**
 * Generate a simple unit vector that can be used as a mock embedding.
 * Embeddings in the same direction are similar; perpendicular ones are dissimilar.
 */
function mockEmbedding(dim: number, mainAxis: number, noise: number = 0.01): number[] {
  const emb = new Array(dim).fill(noise);
  emb[mainAxis] = 1.0;
  return emb;
}

describe('detectNovelDocuments', () => {
  it('returns 0 novel rate for empty embeddings', () => {
    const result = detectNovelDocuments([], [1, 0, 0]);
    expect(result.novelRate).toBe(0);
    expect(result.novelIndices).toEqual([]);
  });

  it('detects no novel docs when all are near centroid', () => {
    const centroid = [1, 0, 0];
    const embeddings = [
      [0.99, 0.01, 0],
      [0.98, 0.02, 0],
      [0.97, 0.03, 0],
    ];
    const result = detectNovelDocuments(embeddings, centroid, 0.3);
    expect(result.novelRate).toBe(0);
    expect(result.novelIndices).toEqual([]);
  });

  it('detects novel docs that are far from centroid', () => {
    const centroid = [1, 0, 0];
    const embeddings = [
      [0.99, 0.01, 0], // close
      [0, 1, 0], // far (perpendicular)
      [0.98, 0.02, 0], // close
      [0, 0, 1], // far (perpendicular)
    ];
    const result = detectNovelDocuments(embeddings, centroid, 0.3);
    expect(result.novelRate).toBe(0.5);
    expect(result.novelIndices).toEqual([1, 3]);
  });

  it('respects custom threshold', () => {
    const centroid = [1, 0, 0];
    const embeddings = [
      [0.85, 0.15, 0], // slightly different
      [0.5, 0.5, 0], // moderately different
    ];
    // With high threshold, nothing is novel
    expect(detectNovelDocuments(embeddings, centroid, 0.9).novelRate).toBe(0);
    // With low threshold, both are novel
    expect(detectNovelDocuments(embeddings, centroid, 0.01).novelRate).toBe(1);
  });
});

describe('computeVarianceRatio', () => {
  it('returns 1 when variances are equal', () => {
    const centroid = [1, 0, 0];
    const embeddings = [
      [0.9, 0.1, 0],
      [0.8, 0.2, 0],
    ];
    const ratio = computeVarianceRatio(embeddings, centroid, embeddings, centroid);
    expect(ratio).toBeCloseTo(1.0, 5);
  });

  it('returns >1 when current is more diverse', () => {
    const centroid = [1, 0, 0];
    const currentEmbs = [
      [0.5, 0.5, 0], // more spread
      [0.5, 0, 0.5],
    ];
    const rollingEmbs = [
      [0.95, 0.05, 0], // tight cluster
      [0.9, 0.1, 0],
    ];
    const ratio = computeVarianceRatio(currentEmbs, centroid, rollingEmbs, centroid);
    expect(ratio).toBeGreaterThan(1);
  });

  it('returns <1 when current is more focused', () => {
    const centroid = [1, 0, 0];
    const currentEmbs = [
      [0.99, 0.01, 0], // tight
      [0.98, 0.02, 0],
    ];
    const rollingEmbs = [
      [0.5, 0.5, 0], // spread
      [0.5, 0, 0.5],
    ];
    const ratio = computeVarianceRatio(currentEmbs, centroid, rollingEmbs, centroid);
    expect(ratio).toBeLessThan(1);
  });

  it('returns 1 when rolling variance is 0', () => {
    const centroid = [1, 0, 0];
    // Identical embeddings = 0 variance
    const embs = [
      [1, 0, 0],
      [1, 0, 0],
    ];
    const ratio = computeVarianceRatio([[0.5, 0.5, 0]], centroid, embs, centroid);
    expect(ratio).toBe(1);
  });

  it('handles empty embeddings', () => {
    const centroid = [1, 0, 0];
    const ratio = computeVarianceRatio([], centroid, [[0.9, 0.1, 0]], centroid);
    expect(ratio).toBe(0);
  });
});

describe('computeRollingThematicDrift wiring (#578)', () => {
  it('carries computed novelty and variance instead of the old 0/1 constants', async () => {
    weekQueue.length = 0;
    // Current week: one doc on the rolling axis, one orthogonal (novel).
    weekQueue.push([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    // Eight rolling weeks tightly clustered on axis 0 (low variance).
    for (let i = 0; i < 8; i++) {
      weekQueue.push([
        [1, 0.01, 0],
        [0.99, 0.02, 0],
      ]);
    }
    const result = await computeRollingThematicDrift('civilService', '2026-01-12');
    expect(result).not.toBeNull();
    // The orthogonal doc is past the 0.5 novelty threshold; the aligned one is not.
    expect(result!.novelDocumentRate).toBeCloseTo(0.5, 5);
    // Current week is far more spread than the tight rolling cluster.
    expect(result!.varianceRatio).toBeGreaterThan(1);
    expect(result!.bootstrap).toBe(false);
  });
});
