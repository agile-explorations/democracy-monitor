import { describe, expect, it } from 'vitest';
import { sqlText as text } from '@/__tests__/helpers/sql-text';
import {
  CORPUS_CATEGORY,
  categoryFacetD,
  countingEligible,
  retrievalRelevantOnly,
  searchable,
  searchableD,
  searchableSql,
} from '@/lib/db/document-filters';

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
