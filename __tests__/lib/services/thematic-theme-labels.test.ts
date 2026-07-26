import { describe, expect, it } from 'vitest';
import { nearestTitles } from '@/lib/services/thematic-theme-labels';

describe('nearestTitles (#583)', () => {
  it('returns titles ordered by similarity to the centroid', () => {
    const docs = [
      { title: 'far', embedding: [0, 1, 0] },
      { title: 'near', embedding: [1, 0.01, 0] },
      { title: 'nearest', embedding: [1, 0, 0] },
    ];
    expect(nearestTitles(docs, [1, 0, 0], 2)).toEqual(['nearest', 'near']);
  });

  it('caps at the requested count and tolerates empty input', () => {
    expect(nearestTitles([], [1, 0], 5)).toEqual([]);
  });
});
