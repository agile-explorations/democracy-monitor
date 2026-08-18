import { describe, expect, it } from 'vitest';
import {
  armWeight,
  dedupeByInstrument,
  dedupeByUrl,
  fuseWeightedRrf,
  normalizeInstrumentTitle,
  RRF_K,
} from '@/lib/services/hybrid-fusion';

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

describe('dedupeByUrl', () => {
  it('keeps the first (highest-ranked) row per URL', () => {
    const docs = [
      { id: 1, url: 'https://a' },
      { id: 2, url: 'https://b' },
      { id: 3, url: 'https://a' },
    ];
    expect(dedupeByUrl(docs).map((d) => d.id)).toEqual([1, 2]);
  });

  it('keeps url-less rows individually', () => {
    const docs = [
      { id: 1, url: null },
      { id: 2, url: null },
    ];
    expect(dedupeByUrl(docs)).toHaveLength(2);
  });
});

describe('normalizeInstrumentTitle (#734)', () => {
  it('strips the CPD instrument prefix so both spellings collide', () => {
    expect(
      normalizeInstrumentTitle('Executive Order 14332—Improving Oversight of Federal Grantmaking'),
    ).toBe(normalizeInstrumentTitle('Improving Oversight of Federal Grantmaking'));
    expect(
      normalizeInstrumentTitle('Memorandum on Use of Appropriated Funds for Illegal Lobbying'),
    ).toBe(normalizeInstrumentTitle('Use of Appropriated Funds for Illegal Lobbying'));
  });

  it('does not strip mid-title instrument words', () => {
    expect(normalizeInstrumentTitle('Rescinding Executive Order 14052')).toBe(
      'rescinding executive order 14052',
    );
  });
});

describe('dedupeByInstrument (#734)', () => {
  const doc = (
    id: number,
    title: string,
    publishedAt: string | null,
    sourceOrigin: string | null,
  ) => ({ id, title, publishedAt, sourceOrigin });

  it('collapses the FR/CPD mirror pair within the window, FR copy winning in place', () => {
    const docs = [
      doc(
        3,
        'Executive Order 14332—Improving Oversight of Federal Grantmaking',
        '2025-08-07',
        'govinfo_cpd',
      ),
      doc(9, 'Unrelated Rule', '2025-08-10', 'federal_register'),
      doc(1, 'Improving Oversight of Federal Grantmaking', '2025-08-12', 'federal_register'),
    ];
    const out = dedupeByInstrument(docs);
    // FR copy replaces the CPD copy at the CPD copy's (higher) rank slot.
    expect(out.map((d) => d.id)).toEqual([1, 9]);
  });

  it('keeps same-title docs a week+ apart when they are not an FR/CPD mirror pair', () => {
    const docs = [
      doc(1, '(INCLUDING TRANSFERS OF FUNDS)', '2026-01-14', 'crec'),
      doc(2, '(INCLUDING TRANSFERS OF FUNDS)', '2026-01-22', 'crec'),
    ];
    expect(dedupeByInstrument(docs)).toHaveLength(2);
  });

  it('collapses same-title same-day rows regardless of origin (revision clusters)', () => {
    const docs = [
      doc(1, 'Trump v. Illinois', '2025-12-23', 'courtlistener'),
      doc(2, 'Trump v. Illinois', '2025-12-23', 'courtlistener'),
    ];
    expect(dedupeByInstrument(docs).map((d) => d.id)).toEqual([1]);
  });

  it('does not window-match same-origin near-dated docs', () => {
    const docs = [
      doc(1, 'Prior Balance Replacement Funds', '2025-11-24', 'federal_register'),
      doc(2, 'Prior Balance Replacement Funds', '2025-11-26', 'federal_register'),
    ];
    expect(dedupeByInstrument(docs)).toHaveLength(2);
  });

  it('treats unparseable dates as same-day only when both are null', () => {
    const both = [
      doc(1, 'Some Order', null, 'federal_register'),
      doc(2, 'Some Order', null, 'govinfo_cpd'),
    ];
    expect(dedupeByInstrument(both)).toHaveLength(1);
    const mixed = [
      doc(1, 'Some Order', null, 'federal_register'),
      doc(2, 'Some Order', '2025-08-07', 'govinfo_cpd'),
    ];
    expect(dedupeByInstrument(mixed)).toHaveLength(2);
  });
});
