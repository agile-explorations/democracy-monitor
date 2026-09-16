import { describe, expect, it } from 'vitest';
import {
  CORPUS_CATEGORY,
  categoryFacetD,
  countingEligible,
  retrievalRelevantOnly,
  searchable,
  searchableD,
  searchableSql,
} from '@/lib/db/document-filters';

/** Render a drizzle SQL chunk to its parameter-inlined text for assertions. */
function text(chunk: ReturnType<typeof searchable>): string {
  const render = (c: unknown): string => {
    if (typeof c === 'string') return c;
    const anyC = c as { queryChunks?: unknown[]; value?: unknown; name?: string };
    if (Array.isArray(anyC.queryChunks)) return anyC.queryChunks.map(render).join('');
    if (Array.isArray(anyC.value)) return anyC.value.join('');
    if (anyC.value !== undefined) return String(anyC.value);
    if (anyC.name) return anyC.name;
    return '';
  };
  return render(chunk).replace(/\s+/g, ' ').trim();
}

describe('population predicates (R-SEARCH-ORTHOGONAL)', () => {
  it('searchable = body present and not superseded; topic is not a search criterion', () => {
    expect(searchableSql('d')).toBe(
      "d.content_type != 'metadata_only' AND d.superseded IS NOT TRUE",
    );
    expect(text(searchableD())).toBe(searchableSql('d'));
    expect(text(searchable())).not.toContain('retrieval_relevant');
    expect(text(searchable())).toContain('superseded');
  });

  it('counting and analysis predicates still exclude off-topic rows', () => {
    expect(text(countingEligible())).toContain('retrieval_relevant');
    expect(text(retrievalRelevantOnly())).toContain('retrieval_relevant');
  });

  it('category facet: routed means category + evidence; corpus means everything unrouted', () => {
    const routed = text(categoryFacetD('mediaFreedom'));
    expect(routed).toContain('d.category = ');
    expect(routed).toContain('d.retrieval_relevant IS NOT FALSE');
    const unrouted = text(categoryFacetD(CORPUS_CATEGORY));
    expect(unrouted).toBe('(d.category = corpus OR d.retrieval_relevant IS FALSE)');
  });
});
