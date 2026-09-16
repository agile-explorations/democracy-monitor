import { describe, expect, it } from 'vitest';
import {
  antiJoinByUrl,
  applyCap,
  countEmbeddable,
  dojReleaseDate,
  isUnroutedCrec,
  precheckOf,
  selectCorpusReleases,
  selectUnroutedCpd,
  splitDateRange,
  weekdaysBetween,
} from '@/lib/services/corpus-restore/plan';
import type { RestoreBatch } from '@/lib/services/corpus-restore/types';
import type { ContentItem } from '@/lib/types';

const item = (link: string, content?: string): ContentItem => ({ title: link, link, content });

describe('applyCap', () => {
  it('keeps everything when no cap is set', () => {
    expect(applyCap([1, 2, 3])).toEqual({ kept: [1, 2, 3], capTripped: false, deferred: 0 });
  });

  it('does not trip when the population fits the cap exactly', () => {
    expect(applyCap([1, 2, 3], 3)).toEqual({ kept: [1, 2, 3], capTripped: false, deferred: 0 });
  });

  it('keeps the first N and reports the trip and the deferred count', () => {
    expect(applyCap([1, 2, 3, 4, 5], 2)).toEqual({ kept: [1, 2], capTripped: true, deferred: 3 });
  });
});

describe('antiJoinByUrl', () => {
  it('drops stored URLs and link-less items', () => {
    const items = [item('https://a'), item('https://b'), { title: 'no link' }];
    expect(antiJoinByUrl(items, new Set(['https://b']))).toEqual([item('https://a')]);
  });
});

describe('precheckOf', () => {
  it('reports matched, net-new, fetched, and embeddable', () => {
    const batch: RestoreBatch = {
      matched: 10,
      netNew: 6,
      candidates: [item('https://a', 'body'), item('https://b', '  '), item('https://c')],
      category: 'corpus',
      capTripped: false,
    };
    const fresh = batch.candidates.slice(0, 2);
    expect(precheckOf(batch, fresh)).toEqual({ matched: 10, netNew: 6, fetched: 2, embeddable: 1 });
    expect(countEmbeddable(batch.candidates)).toBe(1);
  });
});

describe('selectUnroutedCpd', () => {
  it('keeps only packages with an empty category list', () => {
    const docs = [
      { item: item('https://cpd/1', 'x'), categories: [], unmappedSubjects: ['Foo'] },
      { item: item('https://cpd/2', 'y'), categories: ['rulemaking'], unmappedSubjects: [] },
      { item: item('https://cpd/3', 'z'), categories: [], unmappedSubjects: [] },
    ];
    expect(selectUnroutedCpd(docs).map((i) => i.link)).toEqual(['https://cpd/1', 'https://cpd/3']);
  });
});

describe('selectCorpusReleases', () => {
  const unix = (iso: string) => String(Math.floor(new Date(iso).getTime() / 1000));
  const from = new Date('2025-01-01');
  const to = new Date('2025-12-31T23:59:59Z');

  it('keeps in-range releases from a corpus component only', () => {
    const releases = [
      { date: unix('2025-03-01'), component: [{ name: 'Office of the Attorney General' }] },
      { date: unix('2025-03-02'), component: [{ name: 'Tax Division' }] },
      {
        date: unix('2025-03-03'),
        component: [{ name: 'Tax Division' }, { name: 'Office of Public Affairs' }],
      },
      { date: unix('2025-03-04'), component: [] },
      { date: unix('2025-03-05') },
    ];
    expect(selectCorpusReleases(releases, from, to).map((r) => r.date)).toEqual([
      unix('2025-03-01'),
      unix('2025-03-03'),
    ]);
  });

  it('drops out-of-range and undated releases', () => {
    const releases = [
      { date: unix('2024-12-31'), component: [{ name: 'Office of Public Affairs' }] },
      { date: unix('2026-01-01'), component: [{ name: 'Office of Public Affairs' }] },
      { component: [{ name: 'Office of Public Affairs' }] },
    ];
    expect(selectCorpusReleases(releases, from, to)).toEqual([]);
  });

  it('parses feed dates as unix seconds', () => {
    expect(dojReleaseDate({ date: '1700000000' })?.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    expect(dojReleaseDate({ date: 'nope' })).toBeNull();
    expect(dojReleaseDate({})).toBeNull();
  });
});

describe('isUnroutedCrec', () => {
  it('is true for a granule no topic term matches and false otherwise', () => {
    expect(
      isUnroutedCrec({
        title: 'TRIBUTE TO THE SPRINGFIELD MARCHING BAND',
        content: 'A fine parade.',
      }),
    ).toBe(true);
    expect(
      isUnroutedCrec({
        title: 'THE FEDERAL WORKFORCE',
        content: 'Our federal employees deserve better.',
      }),
    ).toBe(false);
  });
});

describe('weekdaysBetween', () => {
  it('skips Saturdays and Sundays, inclusive of both ends', () => {
    // 2025-01-17 is a Friday; 2025-01-21 a Tuesday.
    expect(weekdaysBetween('2025-01-17', '2025-01-21')).toEqual([
      '2025-01-17',
      '2025-01-20',
      '2025-01-21',
    ]);
  });

  it('is empty when from is after to', () => {
    expect(weekdaysBetween('2025-01-21', '2025-01-17')).toEqual([]);
  });
});

describe('splitDateRange', () => {
  it('produces consecutive inclusive windows clipped to the range end', () => {
    expect(splitDateRange('2025-01-01', '2025-01-25', 10)).toEqual([
      { from: '2025-01-01', to: '2025-01-10' },
      { from: '2025-01-11', to: '2025-01-20' },
      { from: '2025-01-21', to: '2025-01-25' },
    ]);
  });

  it('returns one window when the range fits', () => {
    expect(splitDateRange('2025-01-01', '2025-01-05', 30)).toEqual([
      { from: '2025-01-01', to: '2025-01-05' },
    ]);
  });
});
