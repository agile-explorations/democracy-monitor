import { describe, expect, it } from 'vitest';
import {
  categoryWeekKey,
  groupItemsByCategoryWeek,
  lateArrivalFlips,
  orderKeysAnchorLast,
  parseCategoryWeekKey,
  partitionGroupsByTerm,
  splitGroupsByCategory,
} from '@/lib/services/category-week-grouping';

const ANCHOR = '2026-09-07';
const item = (title: string, pubDate?: string) => ({ title, pubDate, content: 'x' });

describe('groupItemsByCategoryWeek (#825)', () => {
  it('fans each item out to every category at the Monday of its publish date', () => {
    const { groups } = groupItemsByCategoryWeek(
      [
        { item: item('Remarks', '2026-04-07'), categories: ['executiveActions', 'fiscal'] },
        { item: item('Letter', '2026-04-09'), categories: ['executiveActions'] },
        { item: item('Proclamation', '2026-04-14'), categories: ['executiveActions'] },
      ],
      { anchorWeekOf: ANCHOR },
    );
    expect([...groups.keys()].sort()).toEqual([
      'executiveActions|2026-04-06',
      'executiveActions|2026-04-13',
      'fiscal|2026-04-06',
    ]);
    expect(groups.get('executiveActions|2026-04-06')).toHaveLength(2);
  });

  it('keeps a late GAO capture in its true week, years before the anchor', () => {
    const { groups } = groupItemsByCategoryWeek(
      [{ item: item('Persistent Chemicals', '2025-02-24'), categories: ['executiveOversight'] }],
      { anchorWeekOf: ANCHOR },
    );
    expect([...groups.keys()]).toEqual(['executiveOversight|2025-02-24']);
  });

  it('puts undated and unparseable items in the anchor week', () => {
    const { groups } = groupItemsByCategoryWeek(
      [
        { item: item('No date'), categories: ['fiscal'] },
        { item: item('Bad date', 'not-a-date'), categories: ['fiscal'] },
      ],
      { anchorWeekOf: ANCHOR },
    );
    expect(groups.get(`fiscal|${ANCHOR}`)).toHaveLength(2);
  });

  it('defers items from the in-progress week instead of deriving them early', () => {
    const { groups, deferredFutureItems } = groupItemsByCategoryWeek(
      [
        { item: item('This week', '2026-09-15'), categories: ['fiscal'] },
        { item: item('Last week', '2026-09-10'), categories: ['fiscal'] },
      ],
      { anchorWeekOf: ANCHOR },
    );
    expect(deferredFutureItems).toBe(1);
    expect([...groups.keys()]).toEqual([`fiscal|${ANCHOR}`]);
  });

  it('always creates an (empty) anchor group for the listed categories', () => {
    const { groups } = groupItemsByCategoryWeek([], {
      anchorWeekOf: ANCHOR,
      ensureAnchorFor: ['elections'],
    });
    expect(groups.get(`elections|${ANCHOR}`)).toEqual([]);
  });

  it('round-trips keys', () => {
    expect(parseCategoryWeekKey(categoryWeekKey('military', '2026-03-02'))).toEqual({
      category: 'military',
      weekOf: '2026-03-02',
    });
  });
});

describe('partitionGroupsByTerm', () => {
  it('splits at the inauguration boundary, inclusive on the current side', () => {
    const groups = new Map([
      ['fiscal|2025-01-13', []],
      ['fiscal|2025-01-20', []],
      ['fiscal|2026-09-07', []],
    ]);
    const { current, baseline } = partitionGroupsByTerm(groups);
    expect([...baseline.keys()]).toEqual(['fiscal|2025-01-13']);
    expect([...current.keys()].sort()).toEqual(['fiscal|2025-01-20', 'fiscal|2026-09-07']);
  });
});

describe('splitGroupsByCategory', () => {
  it('buckets groups per category, keeping every week', () => {
    const split = splitGroupsByCategory(
      new Map([
        ['fiscal|2026-08-03', [item('a')]],
        ['fiscal|2026-09-07', []],
        ['military|2026-08-03', [item('b')]],
      ]),
    );
    expect([...split.keys()].sort()).toEqual(['fiscal', 'military']);
    expect([...split.get('fiscal')!.keys()]).toEqual(['fiscal|2026-08-03', 'fiscal|2026-09-07']);
    expect(split.get('military')!.get('military|2026-08-03')).toHaveLength(1);
  });
});

describe('orderKeysAnchorLast', () => {
  it('re-derives old weeks first and the anchor week last', () => {
    expect(
      orderKeysAnchorLast(['a|2026-09-07', 'a|2025-02-24', 'a|2026-08-03'], '2026-09-07'),
    ).toEqual(['a|2025-02-24', 'a|2026-08-03', 'a|2026-09-07']);
  });
});

describe('lateArrivalFlips', () => {
  const flips = [
    { category: 'executiveOversight', weekOf: '2026-08-03', from: 'Elevated', to: 'Stable' },
    { category: 'executiveOversight', weekOf: '2026-09-07', from: '(none)', to: 'Elevated' },
    { category: 'executiveOversight', weekOf: '2025-02-24', from: '(none)', to: 'Stable' },
    { category: 'fiscal', weekOf: '2026-08-03', from: 'Stable', to: 'Elevated' },
  ];

  it("keeps only this category's re-derived old weeks with a prior status", () => {
    expect(lateArrivalFlips(flips, 'executiveOversight', ['2026-08-03', '2025-02-24'])).toEqual([
      flips[0],
    ]);
  });

  it('ignores the anchor week and other categories', () => {
    expect(lateArrivalFlips(flips, 'fiscal', ['2026-09-07'])).toEqual([]);
  });
});
