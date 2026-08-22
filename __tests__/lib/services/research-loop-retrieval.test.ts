import { describe, expect, it } from 'vitest';
import type { SlotArm } from '@/lib/services/research-loop-retrieval';
import { composeArmSlotPool, PER_ARM_CAP } from '@/lib/services/research-loop-retrieval';

const arm = (phrase: string, matches: number, ids: number[]): SlotArm => ({
  phrase,
  matches,
  items: ids.map((id) => ({ id, sourceType: 'press_release' })),
});

describe('composeArmSlotPool (#762)', () => {
  it('caps every arm at perArmCap regardless of breadth', () => {
    const picked = composeArmSlotPool(
      [arm('broad', 600, [1, 2, 3, 4, 5, 6]), arm('sharp', 5, [10, 11, 12])],
      new Set(),
      2,
      10,
    );
    const byArm = new Map<number, number>();
    for (const h of picked) byArm.set(h.id < 10 ? 0 : 1, (byArm.get(h.id < 10 ? 0 : 1) ?? 0) + 1);
    expect(byArm.get(0)).toBe(2);
    expect(byArm.get(1)).toBe(2);
  });

  it('orders sharpest arm first and round-robins fairly', () => {
    const picked = composeArmSlotPool(
      [arm('broad', 600, [1, 2]), arm('sharp', 5, [10, 11])],
      new Set(),
      2,
      4,
    );
    expect(picked.map((h) => h.id)).toEqual([10, 1, 11, 2]);
  });

  it('is deterministic under equal matches via phrase tiebreak', () => {
    const run = () =>
      composeArmSlotPool([arm('zeta', 7, [5]), arm('alpha', 7, [6])], new Set(), 1, 2).map(
        (h) => h.id,
      );
    expect(run()).toEqual([6, 5]);
    expect(run()).toEqual(run());
  });

  it('skips excluded and duplicate ids without consuming the cap', () => {
    const picked = composeArmSlotPool(
      [arm('a', 3, [1, 2, 3]), arm('b', 4, [2, 4])],
      new Set([1]),
      2,
      10,
    );
    expect(picked.map((h) => h.id).sort()).toEqual([2, 3, 4]);
  });

  it('returns empty for an empty roster (degrades to seed-only)', () => {
    expect(composeArmSlotPool([], new Set(), PER_ARM_CAP, 30)).toEqual([]);
  });

  it('stops at totalSlots', () => {
    const picked = composeArmSlotPool(
      [arm('a', 1, [1, 2]), arm('b', 2, [3, 4]), arm('c', 3, [5, 6])],
      new Set(),
      2,
      3,
    );
    expect(picked.length).toBe(3);
  });
});
