import { describe, expect, it } from 'vitest';
import type { ExtractedPhrase } from '@/lib/services/entity-extraction';
import {
  hotEntityScore,
  mergeDocExtraction,
  rankHotEntities,
  RECENT_WEIGHT,
} from '@/lib/services/hot-entity-ranking';
import type { HotEntityEntry } from '@/lib/services/hot-entity-ranking';

const CUTOFF = '2026-06-24T00:00:00Z';

function phrase(p: string): ExtractedPhrase {
  return { phrase: p, docFreq: 1, entityClass: 'caption' };
}

describe('mergeDocExtraction', () => {
  it('accumulates term and recent frequencies with sample docs', () => {
    const acc = new Map<string, HotEntityEntry>();
    mergeDocExtraction(
      acc,
      { id: 1, title: 'Old Doc', publishedAt: '2025-03-01T00:00:00Z' },
      [phrase('J.G.G. v. Trump')],
      CUTOFF,
    );
    mergeDocExtraction(
      acc,
      { id: 2, title: 'New Doc', publishedAt: '2026-08-01T00:00:00Z' },
      [phrase('J.G.G. v. Trump')],
      CUTOFF,
    );
    const entry = acc.get('j.g.g. v. trump');
    expect(entry).toMatchObject({
      docFreqTerm: 2,
      docFreqRecent: 1,
      mentionDocIds: [1, 2],
    });
  });

  it('merges case-insensitively', () => {
    const acc = new Map<string, HotEntityEntry>();
    mergeDocExtraction(
      acc,
      { id: 1, title: 'A', publishedAt: null },
      [phrase('Cook v. Trump')],
      CUTOFF,
    );
    mergeDocExtraction(
      acc,
      { id: 2, title: 'B', publishedAt: null },
      [phrase('COOK V. TRUMP')],
      CUTOFF,
    );
    expect(acc.size).toBe(2 - 1);
  });
});

describe('rankHotEntities', () => {
  const entry = (p: string, term: number, recent: number): [string, HotEntityEntry] => [
    p.toLowerCase(),
    {
      phrase: p,
      entityClass: 'caption',
      docFreqTerm: term,
      docFreqRecent: recent,
      docFreqBaseline: 0,
      mentionDocIds: [1],
    },
  ];

  it('boosts recent mentions over faded ones', () => {
    const acc = new Map([entry('Faded v. Case', 10, 0), entry('Hot v. Case', 8, 2)]);
    const ranked = rankHotEntities(acc, 2, 10);
    const hot = acc.get('hot v. case')!;
    expect(hotEntityScore(hot)).toBeCloseTo(8 * Math.log(9) * (1 + (RECENT_WEIGHT * 2) / 8), 5);
    expect(ranked[0].phrase).toBe('Hot v. Case');
  });

  it('collapses era-invariant boilerplate via the baseline denominator', () => {
    const boilerplate = entry('Ashcroft v. Iqbal', 6000, 5);
    boilerplate[1].docFreqBaseline = 12000;
    const marquee = entry('Abrego v. Noem', 200, 20);
    const acc = new Map([boilerplate, marquee]);
    expect(rankHotEntities(acc, 2, 10)[0].phrase).toBe('Abrego v. Noem');
  });

  it('applies the doc-frequency floor and the cap', () => {
    const acc = new Map([entry('A v. B', 1, 0), entry('C v. D', 5, 0), entry('E v. F', 4, 0)]);
    expect(rankHotEntities(acc, 2, 1).map((e) => e.phrase)).toEqual(['C v. D']);
  });
});
