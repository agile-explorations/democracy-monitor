import { afterEach, describe, expect, it } from 'vitest';
import type { SlotArm } from '@/lib/services/research-loop-retrieval';
import {
  composeArmSlotPool,
  composeRoster,
  composeWithArms,
  enumPoolRerankEnabled,
  mergeArmPoolByCosine,
  orderArmPoolByCosine,
  PER_ARM_CAP,
} from '@/lib/services/research-loop-retrieval';
import type { ResearchDocument } from '@/lib/services/search-service';

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

describe('composeRoster priority seats (2026-08-24 gate miss)', () => {
  const alias = (phrase: string, matches: number) => ({ phrase, matches });

  it('judge-picked arms claim seats ahead of sharper unjudged arms', () => {
    const swarm = Array.from({ length: 20 }, (_, i) => alias(`tiny-${i}`, 5 + i));
    const canon = alias('Trump v. J.G.G.', 31);
    const roster = composeRoster([...swarm, canon], ['Trump v. J.G.G.'], 18, 10);
    expect(roster.some((a) => a.phrase === 'Trump v. J.G.G.')).toBe(true);
    expect(roster[0].phrase).toBe('Trump v. J.G.G.');
    expect(roster).toHaveLength(18);
  });

  it('keeps judge relevance order within the priority seats', () => {
    const aliases = [alias('a', 50), alias('b', 5), alias('c', 30)];
    const roster = composeRoster(aliases, ['c', 'a'], 18, 10);
    expect(roster.slice(0, 2).map((r) => r.phrase)).toEqual(['c', 'a']);
  });

  it('caps priority seats and fills the rest sharpest-first', () => {
    const priority = Array.from({ length: 12 }, (_, i) => alias(`p-${i}`, 100 + i));
    const rest = [alias('sharp', 1), alias('blunt', 999)];
    const roster = composeRoster(
      [...priority, ...rest],
      priority.map((a) => a.phrase),
      12,
      10,
    );
    // Seats 0-9 are the first ten priority phrases in judge order; the two
    // unclaimed priority arms then compete sharpest-first with everyone else.
    expect(roster.slice(0, 10).map((a) => a.phrase)).toEqual(
      priority.slice(0, 10).map((a) => a.phrase),
    );
    expect(roster.map((a) => a.phrase)).toContain('sharp');
    expect(roster.map((a) => a.phrase)).not.toContain('blunt');
  });

  it('without priority phrases degrades to the sharpest-first slice', () => {
    const aliases = [alias('big', 500), alias('mid', 50), alias('small', 5)];
    expect(composeRoster(aliases, [], 2, 10).map((a) => a.phrase)).toEqual(['small', 'mid']);
  });
});

const doc = (
  id: number,
  cosineSimilarity: number,
  provenance: 'seed' | 'arm' = 'seed',
): ResearchDocument =>
  ({
    id,
    title: `doc-${id}`,
    content: null,
    url: `https://example.gov/${id}`,
    publishedAt: '2025-01-01',
    sourceType: 'Rule',
    tier: 'action',
    sourceOrigin: 'federal_register',
    caseId: null,
    category: 'rulemaking',
    cosineSimilarity,
    finalScore: null,
    documentClass: null,
    p2Assessment: null,
    p2ErosionType: null,
    p2Confidence: null,
    p2Summary: null,
    provenance,
  }) as ResearchDocument;

describe('arm-pool order and composition (#800)', () => {
  it('orders the arm pool by cosine, stable on ties', () => {
    const pool = [doc(1, 0.2, 'arm'), doc(2, 0.6, 'arm'), doc(3, 0.6, 'arm'), doc(4, 0.4, 'arm')];
    expect(orderArmPoolByCosine(pool).map((d) => d.id)).toEqual([2, 3, 4, 1]);
    expect(pool.map((d) => d.id)).toEqual([1, 2, 3, 4]); // input untouched
  });

  it('keeps the slot guarantee (membership) while putting the best arm docs first', () => {
    const seed = [doc(10, 0.9), doc(11, 0.8), doc(12, 0.7), doc(13, 0.6)];
    const arms = [doc(20, 0.1, 'arm'), doc(21, 0.5, 'arm')];
    const out = composeWithArms(seed, arms, 4);
    expect(out).toHaveLength(4);
    expect(out.map((d) => d.id)).toContain(20);
    expect(out.map((d) => d.id)).toContain(21);
    // the higher-cosine arm doc takes the first arm slot
    expect(out.map((d) => d.id).indexOf(21)).toBeLessThan(out.map((d) => d.id).indexOf(20));
  });

  it('merges era-window arm docs by cosine rank instead of interleaving (#800)', () => {
    const seed = [doc(10, 0.9), doc(11, 0.7), doc(12, 0.5), doc(13, 0.3), doc(14, 0.2)];
    const arms = [doc(20, 0.1, 'arm'), doc(21, 0.6, 'arm')];
    const out = mergeArmPoolByCosine(seed, arms, 5);
    expect(out.map((d) => d.id)).toEqual([10, 11, 21, 12, 20]);
    expect(out).toHaveLength(5);
  });

  it('degrades to the seed when there is no arm pool', () => {
    const seed = [doc(1, 0.9), doc(2, 0.8)];
    expect(composeWithArms(seed, [], 1).map((d) => d.id)).toEqual([1]);
  });
});

describe('ENUM_POOL_RERANK knob (#800)', () => {
  const prev = process.env.ENUM_POOL_RERANK;
  afterEach(() => {
    if (prev === undefined) delete process.env.ENUM_POOL_RERANK;
    else process.env.ENUM_POOL_RERANK = prev;
  });
  it('is on by default and only "off" disables it', () => {
    delete process.env.ENUM_POOL_RERANK;
    expect(enumPoolRerankEnabled()).toBe(true);
    process.env.ENUM_POOL_RERANK = 'off';
    expect(enumPoolRerankEnabled()).toBe(false);
    process.env.ENUM_POOL_RERANK = 'on';
    expect(enumPoolRerankEnabled()).toBe(true);
  });
});
