import { describe, expect, it } from 'vitest';
import { armWeight, fuseWeightedRrf, RRF_K } from '@/lib/services/hybrid-fusion';

interface Item {
  id: number;
  matchSnippet?: string;
  matchedAlias?: string;
}

const items = (...ids: number[]): Item[] => ids.map((id) => ({ id }));

describe('armWeight', () => {
  it('gives specific aliases near-full weight', () => {
    // Canary calibration: vs a 150-deep primary arm under RRF k=60 an arm
    // needs weight > ~0.67 to surface — specific aliases must clear that.
    expect(armWeight(5)).toBeGreaterThan(0.9);
    expect(armWeight(29)).toBeGreaterThan(0.85);
    expect(armWeight(100)).toBeGreaterThan(0.7);
  });

  it('damps broad aliases below specific ones', () => {
    expect(armWeight(1000)).toBeLessThan(armWeight(100));
    expect(armWeight(10000)).toBeLessThan(0.5);
  });

  it('decreases monotonically', () => {
    const weights = [1, 10, 100, 1000, 10000].map(armWeight);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThan(weights[i - 1]);
    }
  });
});

describe('fuseWeightedRrf', () => {
  it('returns the primary list unchanged when there are no alias arms', () => {
    const primary = items(3, 1, 2);
    expect(fuseWeightedRrf(primary, [], 10).map((d) => d.id)).toEqual([3, 1, 2]);
  });

  it('boosts documents surfaced by both arms above single-arm documents', () => {
    const primary = items(1, 2, 3);
    const arm = { items: items(3), weight: 1 };
    // Doc 3: rank-2 primary + rank-0 arm beats doc 1 (rank-0 primary only).
    expect(fuseWeightedRrf(primary, [arm], 3)[0].id).toBe(3);
  });

  it('lets a full-weight alias arm surface documents missing from the primary arm', () => {
    const primary = items(...Array.from({ length: 150 }, (_, i) => i + 1));
    const arm = { items: items(999), weight: 1 };
    const fused = fuseWeightedRrf(primary, [arm], 30);
    // Arm rank-0 (1/61) beats primary ranks 61+ (< 1/61): well inside top 30.
    expect(fused.map((d) => d.id)).toContain(999);
  });

  it('keeps low-weight arm docs below a deep primary arm', () => {
    const primary = items(...Array.from({ length: 150 }, (_, i) => i + 1));
    const arm = { items: items(999), weight: 0.3 };
    // 0.3/(k+1) < 1/(k+31): a heavily damped arm cannot crack the top 30.
    expect(0.3 / (RRF_K + 1)).toBeLessThan(1 / (RRF_K + 31));
    const fused = fuseWeightedRrf(primary, [arm], 30);
    expect(fused.map((d) => d.id)).not.toContain(999);
  });

  it('merges snippet metadata from arm rows onto primary rows', () => {
    const primary: Item[] = [{ id: 1 }, { id: 2 }];
    const arm = {
      items: [{ id: 2, matchSnippet: 'around the [[match]]', matchedAlias: 'match' }],
      weight: 1,
    };
    const fused = fuseWeightedRrf(primary, [arm], 5);
    const doc2 = fused.find((d) => d.id === 2);
    expect(doc2?.matchSnippet).toBe('around the [[match]]');
    expect(doc2?.matchedAlias).toBe('match');
  });

  it('respects topK', () => {
    expect(fuseWeightedRrf(items(1, 2, 3, 4, 5), [], 2)).toHaveLength(2);
  });
});
