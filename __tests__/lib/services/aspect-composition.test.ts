import { describe, expect, it } from 'vitest';
import { composeAspectPools } from '@/lib/services/aspect-composition';
import type { ResearchDocument } from '@/lib/types/search';

let nextId = 1;
function doc(overrides: Partial<ResearchDocument> = {}): ResearchDocument {
  const id = overrides.id ?? nextId++;
  return {
    id,
    title: `Document ${id}`,
    content: null,
    url: `https://example.com/${id}`,
    publishedAt: '2026-01-15T00:00:00Z',
    sourceType: 'federal_register',
    tier: 'action',
    sourceOrigin: 'federal_register',
    caseId: null,
    category: 'civilLiberties',
    cosineSimilarity: 0.5,
    finalScore: null,
    documentClass: null,
    p2Assessment: null,
    p2ErosionType: null,
    p2Confidence: null,
    p2Summary: null,
    ...overrides,
  };
}

describe('composeAspectPools', () => {
  it('round-robins kept docs so every aspect keeps representation', () => {
    const a = [doc(), doc(), doc()];
    const b = [doc(), doc(), doc()];
    const { docs, docCounts } = composeAspectPools(
      [
        { kept: a, overflow: [] },
        { kept: b, overflow: [] },
      ],
      6,
    );
    expect(docs.map((d) => d.id)).toEqual([a[0].id, b[0].id, a[1].id, b[1].id, a[2].id, b[2].id]);
    expect(docCounts).toEqual([3, 3]);
  });

  it('dedupes shared docs across aspects and backfills from overflow', () => {
    const shared = doc();
    const a = [shared, doc()];
    const b = [doc({ id: shared.id, url: shared.url }), doc()];
    const spare = doc();
    const { docs, docCounts } = composeAspectPools(
      [
        { kept: a, overflow: [spare] },
        { kept: b, overflow: [] },
      ],
      4,
    );
    expect(docs).toHaveLength(4);
    expect(new Set(docs.map((d) => d.id)).size).toBe(4);
    // The shared doc is attributed to the first aspect that offered it.
    expect(docCounts[0]).toBe(3); // shared + own + backfilled spare
    expect(docCounts[1]).toBe(1);
  });

  it('dedupes same-instrument FR/CPD mirror pairs across aspects', () => {
    const fr = doc({
      title: 'Improving Oversight of Federal Grantmaking',
      sourceOrigin: 'federal_register',
      publishedAt: '2026-01-20T00:00:00Z',
    });
    const cpd = doc({
      title: 'Executive Order 14332—Improving Oversight of Federal Grantmaking',
      sourceOrigin: 'govinfo_cpd',
      publishedAt: '2026-01-16T00:00:00Z',
      url: 'https://example.com/cpd-copy',
    });
    const { docs } = composeAspectPools(
      [
        { kept: [fr], overflow: [] },
        { kept: [cpd], overflow: [] },
      ],
      2,
    );
    expect(docs).toHaveLength(1);
  });

  it('slices to budget when pools exceed it', () => {
    const pools = [
      { kept: [doc(), doc(), doc(), doc()], overflow: [] },
      { kept: [doc(), doc(), doc(), doc()], overflow: [] },
    ];
    const { docs } = composeAspectPools(pools, 5);
    expect(docs).toHaveLength(5);
  });

  it('returns fewer than budget only when kept and overflow are exhausted', () => {
    const { docs } = composeAspectPools([{ kept: [doc()], overflow: [doc()] }], 10);
    expect(docs).toHaveLength(2);
  });
});
