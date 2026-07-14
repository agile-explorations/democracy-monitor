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
