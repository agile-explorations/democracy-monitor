import { describe, expect, it } from 'vitest';
import type { EntityRow, PoolEntityRow } from '@/lib/services/hot-entity-selection';
import {
  categoryFillScore,
  finalizeArms,
  MAX_SALIENCE_ARMS_ENUM,
  categorySupportFloor,
  dominantCategories,
  MIN_POOL_MENTIONS,
  nominateShortlist,
  rankCategoryEntities,
  rankPoolEntities,
  stabilityFloor,
  stratifyByClass,
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

describe('categorySupportFloor (#740 H3 fix)', () => {
  it('excludes a single stray doc from a large pool', () => {
    // H3 measured case: 1 mediaFreedom doc in a 60-doc pool outranked
    // lawEnforcement (10/60) purely on global-share division.
    const poolCategories = [
      ...Array(10).fill('lawEnforcement'),
      ...Array(9).fill('civilLiberties'),
      ...Array(8).fill('rulemaking'),
      'mediaFreedom',
    ];
    const shares = new Map([
      ['lawEnforcement', 0.15],
      ['civilLiberties', 0.3],
      ['rulemaking', 0.1],
      ['mediaFreedom', 0.005],
    ]);
    const cats = dominantCategories(poolCategories, shares);
    expect(cats).not.toContain('mediaFreedom');
  });

  it('keeps proportionally supported categories in small pools', () => {
    expect(categorySupportFloor(7)).toBe(2);
    expect(categorySupportFloor(60)).toBe(3);
  });
});

describe('finalizeArms mechanical top-up (#762)', () => {
  const row = (phrase: string, cls = 'eo'): EntityRow => ({
    phrase,
    entityClass: cls,
    categories: ['executiveOversight'],
    ftsMatches: 10,
    docFreqTerm: 10,
    docFreqBaseline: 0,
  });

  it('includes top mechanical nominees the judge passed over', () => {
    const shortlist = Array.from({ length: 15 }, (_, i) =>
      row(`entity-${String(i).padStart(2, '0')}`),
    );
    const picks = ['entity-14']; // judge picks only the last nominee
    const arms = finalizeArms(shortlist, picks, [], []);
    const phrases = arms.map((a) => a.phrase);
    // top-8 mechanical nominees run regardless of judge picks
    for (let i = 0; i < 8; i++) expect(phrases).toContain(`entity-0${i}`);
    expect(phrases).toContain('entity-14');
  });

  it('ranks the top-up by breadth score, not shortlist position (#774)', () => {
    // Pool-channel genre flood: many low-breadth captions at the shortlist
    // head; one high-breadth canon entity deep in the category channel.
    const mill = Array.from({ length: 12 }, (_, i) => ({
      ...row(`mill-case-${String(i).padStart(2, '0')}`, 'caption'),
      categories: ['civilLiberties'],
      docFreqTerm: 9,
    }));
    const canon = {
      ...row('J.G.G. v. Trump', 'caption'),
      categories: ['civilLiberties', 'immigrationEnforcement', 'executiveActions', 'military'],
      docFreqTerm: 19,
    };
    const arms = finalizeArms([...mill, canon], [], [], []);
    expect(arms.map((a) => a.phrase)).toContain('J.G.G. v. Trump');
  });

  it('caps the widened roster at MAX_SALIENCE_ARMS_ENUM', () => {
    const shortlist = Array.from({ length: 40 }, (_, i) => row(`e-${String(i).padStart(2, '0')}`));
    const arms = finalizeArms(shortlist, null, [], []);
    expect(arms.length).toBeLessThanOrEqual(MAX_SALIENCE_ARMS_ENUM);
  });
});

describe('stratifyByClass (#775)', () => {
  const e = (phrase: string, cls: string, freq: number, cats = 2): EntityRow => ({
    phrase,
    entityClass: cls,
    categories: Array.from({ length: cats }, (_, i) => `cat-${i}`),
    ftsMatches: freq,
    docFreqTerm: freq,
    docFreqBaseline: 0,
  });

  it('admits top-of-class entities a flat cap would exclude', () => {
    // 19 EO giants (the measured IM3 flood) + a caption canon below them all.
    const giants = Array.from({ length: 19 }, (_, i) => e(`EO-${i}`, 'eo', 500 - i, 5));
    const canon = e('J.G.G. v. Trump', 'caption', 19, 5);
    const out = stratifyByClass([...giants, canon], 5);
    expect(out.map((r) => r.phrase)).toContain('J.G.G. v. Trump');
    expect(out.filter((r) => r.entityClass === 'eo').length).toBe(5);
  });

  it('keeps overall breadth ordering across the stratified survivors', () => {
    const out = stratifyByClass([e('small-cap', 'caption', 10), e('big-eo', 'eo', 100)], 5);
    expect(out[0].phrase).toBe('big-eo');
  });

  it('applies the same quota to every class', () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => e(`c-${i}`, 'caption', 50 - i)),
      ...Array.from({ length: 8 }, (_, i) => e(`p-${i}`, 'person', 40 - i)),
    ];
    const out = stratifyByClass(rows, 3);
    expect(out.filter((r) => r.entityClass === 'caption').length).toBe(3);
    expect(out.filter((r) => r.entityClass === 'person').length).toBe(3);
  });
});

describe('question-channel shortlist ordering (#776)', () => {
  const e = (phrase: string, cls = 'caption'): EntityRow => ({
    phrase,
    entityClass: cls,
    categories: ['civilLiberties'],
    ftsMatches: 10,
    docFreqTerm: 10,
    docFreqBaseline: 0,
  });

  it('places question-conditioned nominees after pool but before category/global', () => {
    const out = nominateShortlist(
      [],
      [e('category-entity')],
      [],
      [e('global-entity')],
      [e('question-entity')],
    );
    expect(out.map((r) => r.phrase)).toEqual([
      'question-entity',
      'category-entity',
      'global-entity',
    ]);
  });

  it('dedupes question nominees against later channels', () => {
    const out = nominateShortlist([], [e('shared')], [], [], [e('shared')]);
    expect(out.length).toBe(1);
  });
});
