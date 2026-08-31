import { describe, expect, it } from 'vitest';
import type { ExtractedPhrase } from '@/lib/services/entity-extraction';
import {
  applyCrossEraFrequencies,
  eraForDate,
  erasForWindow,
  hotEntityScore,
  mergeDocCounts,
  mergeDocExtraction,
  rankHotEntities,
  RECENT_WEIGHT,
} from '@/lib/services/hot-entity-ranking';
import type { CountEntry, HotEntityEntry } from '@/lib/services/hot-entity-ranking';

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

describe('mergeDocCounts — pass-A lean accumulator (#826/#827)', () => {
  it('counts like mergeDocExtraction and never allocates heavy fields', () => {
    const counts = new Map<string, CountEntry>();
    const heavy = new Map<string, HotEntityEntry>();
    const docs = [
      { id: 1, title: 'Doe v. Noem', publishedAt: '2025-03-01T00:00:00Z' },
      { id: 2, title: 'Order on motions', publishedAt: '2026-08-01T00:00:00Z' },
    ];
    for (const d of docs) {
      mergeDocCounts(counts, d, [phrase('Doe v. Noem')], CUTOFF);
      mergeDocExtraction(heavy, d, [phrase('Doe v. Noem')], CUTOFF);
    }
    const lean = counts.get('doe v. noem')!;
    const full = heavy.get('doe v. noem')!;
    expect(lean.docFreqTerm).toBe(full.docFreqTerm);
    expect(lean.docFreqRecent).toBe(full.docFreqRecent);
    expect('mentionDocIds' in lean).toBe(false);
  });

  it('anchors a caption when any doc title carries it, and stays anchored', () => {
    const acc = new Map<string, CountEntry>();
    mergeDocCounts(
      acc,
      { title: 'Opinion citing precedent', publishedAt: null },
      [phrase('Baze v. Rees')],
      CUTOFF,
    );
    expect(acc.get('baze v. rees')!.titleAnchored).toBe(false);
    mergeDocCounts(
      acc,
      { title: 'Baze v Rees — order', publishedAt: null },
      [phrase('Baze v. Rees')],
      CUTOFF,
    );
    mergeDocCounts(
      acc,
      { title: 'Another citing doc', publishedAt: null },
      [phrase('Baze v. Rees')],
      CUTOFF,
    );
    expect(acc.get('baze v. rees')!.titleAnchored).toBe(true);
  });

  it('ranking drops never-anchored captions and keeps anchored and non-caption entries', () => {
    const mk = (
      p: string,
      cls: CountEntry['entityClass'],
      anchored: boolean,
    ): [string, CountEntry] => [
      p.toLowerCase(),
      {
        phrase: p,
        entityClass: cls,
        docFreqTerm: 50,
        docFreqRecent: 0,
        docFreqBaseline: 0,
        titleAnchored: anchored,
      },
    ];
    const acc = new Map([
      mk('Baze v. Rees', 'caption', false),
      mk('Doe v. Noem', 'caption', true),
      mk('Alien Enemies Act', 'statute', false),
    ]);
    const ranked = rankHotEntities(acc, 2, 10).map((e) => e.phrase);
    expect(ranked).toContain('Doe v. Noem');
    expect(ranked).toContain('Alien Enemies Act');
    expect(ranked).not.toContain('Baze v. Rees');
  });

  it('legacy HotEntityEntry fixtures without the flag still rank (undefined passes)', () => {
    const acc = new Map<string, HotEntityEntry>([
      [
        'cook v. trump',
        {
          phrase: 'Cook v. Trump',
          entityClass: 'caption',
          docFreqTerm: 9,
          docFreqRecent: 0,
          docFreqBaseline: 0,
          mentionDocIds: [1],
          categoryCounts: {},
        },
      ],
    ]);
    expect(rankHotEntities(acc, 2, 10).map((e) => e.phrase)).toEqual(['Cook v. Trump']);
  });
});

describe('eraForDate (#760)', () => {
  it('maps publication dates to analysis eras', () => {
    expect(eraForDate('2026-08-01T00:00:00Z')).toBe('trump_t2');
    expect(eraForDate('2022-06-01T00:00:00Z')).toBe('biden');
    expect(eraForDate('2019-03-01T00:00:00Z')).toBe('trump_t1');
    expect(eraForDate(null)).toBe('trump_t2');
  });
});

describe('applyCrossEraFrequencies (#760)', () => {
  const entry = (term: number): HotEntityEntry => ({
    phrase: 'Ashcroft v. Iqbal',
    entityClass: 'caption',
    docFreqTerm: term,
    docFreqRecent: 0,
    docFreqBaseline: 0,
    mentionDocIds: [1],
    categoryCounts: {},
  });

  it('sets each era denominator to the sum of the other eras', () => {
    const accs = {
      trump_t1: new Map([['ashcroft v. iqbal', entry(100)]]),
      biden: new Map([['ashcroft v. iqbal', entry(80)]]),
      trump_t2: new Map([['ashcroft v. iqbal', entry(120)]]),
    };
    applyCrossEraFrequencies(accs);
    expect(accs.trump_t2.get('ashcroft v. iqbal')!.docFreqBaseline).toBe(180);
    expect(accs.biden.get('ashcroft v. iqbal')!.docFreqBaseline).toBe(220);
    expect(accs.trump_t1.get('ashcroft v. iqbal')!.docFreqBaseline).toBe(200);
  });
});

describe('erasForWindow (#762)', () => {
  it('returns all eras for an unbounded window', () => {
    expect(erasForWindow(null, null)).toEqual(['trump_t1', 'biden', 'trump_t2']);
  });

  it('returns only trump_t2 for a current-term window', () => {
    expect(erasForWindow('2025-01-20', null)).toEqual(['trump_t2']);
  });

  it('spans eras when the window does', () => {
    expect(erasForWindow('2020-06-01', '2021-06-01')).toEqual(['trump_t1', 'biden']);
  });

  it('handles a fully past window', () => {
    expect(erasForWindow('2018-01-01', '2019-01-01')).toEqual(['trump_t1']);
  });
});
