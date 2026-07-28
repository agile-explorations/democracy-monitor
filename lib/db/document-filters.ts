import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { documents } from '@/lib/db/schema';

/**
 * Retrieval-relevance exclusion (#524/#544). Documents annotated
 * `retrieval_relevant = false` were retrieved by an over-broad full-text
 * signal query and are off-topic for their category: they stay stored for
 * auditability but must not reach assessment, statistics, search, or exports.
 * NULL means relevant — only an explicit `false` excludes.
 *
 * Every reader of the `documents` table that feeds a downstream consumer
 * must apply one of these. Deleted derived rows (document_scores,
 * ai_document_assessments, p2025_matches) are the other half of the
 * mechanism; the validate:data invariant check guards both.
 */
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
