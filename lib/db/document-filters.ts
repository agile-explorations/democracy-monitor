import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { documents } from '@/lib/db/schema';

/**
 * Three document populations (R-SEARCH-ORTHOGONAL, owner decision
 * 2026-09-08/15). The corpus is one thing; the departure analysis and search
 * are two independent uses of it:
 *
 *   Searchable         `searchable()` — has a body, not a superseded revision.
 *                      Search, research retrieval, similar-docs, the research
 *                      counter, the hero and the embedder. Topic is NOT a
 *                      search criterion.
 *   Counting           `countingEligible()` — structural statistics, silence,
 *                      drift, baselines.
 *   Analysis evidence  `retrievalRelevantOnly()` — scoring, AI review,
 *                      narratives, validation, tipwire.
 *
 * `retrieval_relevant = false` means exactly "this (url, category) row is not
 * detection evidence": off-topic for the category whose signal fetched it
 * (#524/#544), a fetch-time drop stored for search, or an unrouted document
 * under the `corpus` pseudo-category. G1b/G5 forbid derived rows on it. It is
 * no longer a search predicate; the population-predicates tripwire test
 * enforces which files may use which predicate.
 */

/** Pseudo-category for documents no router placed (CHRG, CREC, CL, CPD,
 *  DOJ): stored for search with both analysis flags false. The literal lives
 *  here, in validate-graph (G6/G8) and the tripwire only. */
export const CORPUS_CATEGORY = 'corpus';

/** Searchable population: body present, not superseded. */
export function searchable(): SQL {
  return sql`${documents.contentType} != 'metadata_only' AND ${documents.superseded} IS NOT TRUE`;
}

/** Same predicate for raw SQL over an aliased documents table. */
export function searchableSql(alias: string): string {
  return `${alias}.content_type != 'metadata_only' AND ${alias}.superseded IS NOT TRUE`;
}

/** The searchable predicate for sql-template call sites over the `d` alias
 *  every search query uses (no sql.raw — parameterized template only). */
export function searchableD(): SQL {
  return sql`d.content_type != 'metadata_only' AND d.superseded IS NOT TRUE`;
}

/**
 * Category facet for search surfaces over the `d` alias: "routed to X" means
 * the row carries category X AND is detection evidence there; the
 * pseudo-category selects every row no router placed (corpus rows and
 * off-topic rows alike), so a routine notice never wears a category badge it
 * was filtered out of.
 */
export function categoryFacetD(category: string): SQL {
  if (category === CORPUS_CATEGORY) {
    return sql`(d.category = ${CORPUS_CATEGORY} OR d.retrieval_relevant IS FALSE)`;
  }
  return sql`(d.category = ${category} AND d.retrieval_relevant IS NOT FALSE)`;
}

/** Analysis-evidence predicate (#524/#544): NULL means evidence — only an
 *  explicit `false` excludes. */
export function retrievalRelevantOnly(): SQL {
  return sql`${documents.retrievalRelevant} IS NOT FALSE`;
}

/** Same condition for raw SQL strings that reference an aliased documents table. */
export function retrievalRelevantOnlySql(alias: string): string {
  return `${alias}.retrieval_relevant IS NOT FALSE`;
}

/**
 * Counting-scope exclusion (#587). Judicial opinions annotated
 * `counting_scope = false` fall outside the documented counting population
 * (opinion-scope classifier, applied uniformly to all eras so document counts
 * are method-consistent across collection changes). They stay stored and
 * remain L2 assessment evidence, but must not enter document counts,
 * structural statistics, embeddings, or drift. NULL means in scope — only an
 * explicit `false` excludes.
 */
export function countingScopeOnly(): SQL {
  return sql`${documents.countingScope} IS NOT FALSE`;
}

/**
 * The full counting-population predicate (#587): excludes docket stubs
 * (metadata_only), retrieval-irrelevant docs, and out-of-scope opinions in one
 * condition. Every surface that counts documents or computes distributions
 * over them (structural dimensions, silence source counts, drift embeddings,
 * baseline centroids) must use this so all statistics describe the same,
 * era-consistent population. Scoring/embedding pipelines with extra conditions
 * (length floor, embedded_at) compose the pieces individually.
 */
export function countingEligible(): SQL {
  return sql`${documents.contentType} != 'metadata_only'
    AND ${documents.retrievalRelevant} IS NOT FALSE
    AND ${documents.countingScope} IS NOT FALSE`;
}
