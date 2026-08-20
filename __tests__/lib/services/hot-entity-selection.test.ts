import { describe, expect, it } from 'vitest';
import type { EntityRow, PoolEntityRow } from '@/lib/services/hot-entity-selection';
import {
  categoryFillScore,
  dominantCategories,
  MIN_POOL_MENTIONS,
  nominateShortlist,
  rankCategoryEntities,
  rankPoolEntities,
  stabilityFloor,
} from '@/lib/services/hot-entity-selection';

const entity = (
  phrase: string,
  docFreqTerm = 50,
  docFreqBaseline = 0,
  categories: string[] = ['civilLiberties', 'lawEnforcement'],
): EntityRow => ({
  phrase,
  entityClass: 'caption',
  categories,
  ftsMatches: 100,
  docFreqTerm,
  docFreqBaseline,
});

const poolRow = (phrase: string, poolMentions: number, docFreqTerm = 50): PoolEntityRow => ({
  ...entity(phrase, docFreqTerm),
  poolMentions,
});

describe('rankPoolEntities', () => {
  it('drops entities below the pool-mention floor', () => {
    const out = rankPoolEntities([poolRow('Discussed Entity', 3), poolRow('Incidental', 1)]);
    expect(out.map((r) => r.phrase)).toEqual(['Discussed Entity']);
    expect(MIN_POOL_MENTIONS).toBeGreaterThan(1);
  });

  it('ranks by pool mentions with novelty tiebreak', () => {
    const eraInvariant = { ...entity('Era Invariant Act', 300, 600), poolMentions: 4 };
    const novel = { ...entity('Novel v. Entity', 200, 0), poolMentions: 4 };
    const out = rankPoolEntities([eraInvariant, novel, poolRow('Most Discussed', 9)]);
    expect(out.map((r) => r.phrase)).toEqual([
      'Most Discussed',
      'Novel v. Entity',
      'Era Invariant Act',
    ]);
  });
});

describe('rankCategoryEntities', () => {
  it('collapses era-invariant boilerplate via the baseline denominator', () => {
    const out = rankCategoryEntities([
      entity('Era Invariant Act', 300, 900, ['a', 'b', 'c']),
      entity('Alien Enemies Act', 65, 1, ['a', 'b', 'c']),
    ]);
    expect(out[0].phrase).toBe('Alien Enemies Act');
  });

  it('breadth separates cross-cutting entities from single-beat captions', () => {
    const single = entity('Vargas Lopez v. Trump', 14, 0, ['a', 'b']);
    const broad = entity('A.A.R.P. v. Trump', 22, 0, ['a', 'b', 'c']);
    expect(categoryFillScore(broad)).toBeGreaterThan(categoryFillScore(single));
  });
});

describe('dominantCategories', () => {
  const shares = new Map([
    ['civilLiberties', 0.5],
    ['lawEnforcement', 0.25],
    ['immigrationEnforcement', 0.08],
    ['military', 0.02],
  ]);

  it('surfaces what the pool is UNUSUALLY about, not raw counts', () => {
    const cats = dominantCategories(
      [
        'civilLiberties',
        'civilLiberties',
        'civilLiberties',
        'civilLiberties',
        'civilLiberties',
        'immigrationEnforcement',
        'immigrationEnforcement',
        null,
      ],
      shares,
    );
    expect(cats[0]).toBe('immigrationEnforcement');
  });

  it('returns [] for an empty pool', () => {
    expect(dominantCategories([null, undefined], shares)).toEqual([]);
  });
});

describe('nominateShortlist', () => {
  it('excludes already-searched phrases before any slot is consumed', () => {
    const out = nominateShortlist(
      [poolRow('Already Mined v. Case', 5), poolRow('Fresh v. Case', 3)],
      [entity('Category Entity')],
      ['already mined v. case'],
    );
    expect(out.map((r) => r.phrase)).toEqual(['Fresh v. Case', 'Category Entity']);
  });

  it('dedupes across channels, doc-join first', () => {
    const out = nominateShortlist(
      [poolRow('Shared v. Entity', 4)],
      [entity('Shared v. Entity'), entity('Fill Entity')],
      [],
    );
    expect(out.map((r) => r.phrase)).toEqual(['Shared v. Entity', 'Fill Entity']);
  });
});

describe('stabilityFloor (#760)', () => {
  it('always keeps top pool nominees and top captions regardless of judge picks', () => {
    const shortlist = [
      { ...entity('Pool One v. Case'), poolMentions: 5 } as EntityRow,
      { ...entity('Pool Two v. Case'), poolMentions: 3 } as EntityRow,
      { ...entity('Fill Statute Act', 50, 0, ['a']), entityClass: 'statute' },
      entity('Fill Caption v. Trump', 40, 0, ['a', 'b', 'c']),
    ];
    const floor = stabilityFloor(shortlist, 2);
    expect(floor.map((r) => r.phrase)).toEqual([
      'Pool One v. Case',
      'Pool Two v. Case',
      'Fill Caption v. Trump',
    ]);
  });

  it('handles a shortlist with no pool channel', () => {
    const floor = stabilityFloor([entity('Solo v. Caption')], 0);
    expect(floor.map((r) => r.phrase)).toEqual(['Solo v. Caption']);
  });
});
