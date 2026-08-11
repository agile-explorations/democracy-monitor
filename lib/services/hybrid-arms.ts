/**
 * Per-alias full-text-search arms for hybrid retrieval (#702).
 *
 * Each corpus-validated alias runs as its own ranked arm: matching uses the
 * full generated search_vector (GIN, fast); ORDER BY ranks on the compact
 * search_rank_vector so ts_rank never detoasts multi-MB vectors — rows
 * awaiting the rank-vector backfill are simply not FTS candidates yet
 * (graceful pre-backfill degradation). ts_headline extracts the matched
 * passage so results show WHY a document matched — essential for large
 * CREC fragments where the mention sits tens of KB deep.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';

type SqlChunk = ReturnType<typeof sql>;

/** FTS candidates fetched per alias arm (canary-validated depth). */
export const ALIAS_ARM_LIMIT = 40;
/** Headline scans at most this much content per row (perf bound). */
const HEADLINE_CONTENT_CHARS = 120000;
/** [[..]] markers instead of HTML tags: the UI renders highlights from the
 *  markers without ever injecting document text as raw HTML. */
const HEADLINE_OPTS = 'MaxFragments=2, MaxWords=40, MinWords=10, StartSel=[[, StopSel=]]';

function quotedPhrase(phrase: string): string {
  return `"${phrase.replace(/"/g, '')}"`;
}

/**
 * Build one alias arm query for research retrieval. Row shape matches the
 * research projection (mapToResearchDoc-compatible) plus match_snippet and
 * matched_alias.
 */
export function buildAliasArmQuery(
  alias: ValidatedAlias,
  vectorStr: string,
  candidateFilters: SqlChunk,
): SqlChunk {
  const tsquery = quotedPhrase(alias.phrase);
  return sql`
    SELECT d.id, d.title, LEFT(d.content, 3000) as content, d.url, d.published_at, d.source_type,
      d.source_origin, d.case_id, d.category,
      1 - (d.embedding <=> ${vectorStr}::vector) as cosine_similarity,
      ds.final_score, ds.document_class,
      ai.assessment as p2_assessment, ai.erosion_type as p2_erosion_type,
      ai.confidence as p2_confidence, LEFT(ai.reasoning, 300) as p2_summary,
      ts_headline('english', LEFT(d.content, ${HEADLINE_CONTENT_CHARS}),
        websearch_to_tsquery('english', ${tsquery}), ${HEADLINE_OPTS}) as match_snippet,
      ${alias.phrase} as matched_alias
    FROM documents d
    LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
    LEFT JOIN ai_document_assessments ai
      ON ai.url = d.url AND ai.category = d.category AND ai.pass = 2
    WHERE ${candidateFilters}
      AND d.search_rank_vector IS NOT NULL
      AND d.search_vector @@ websearch_to_tsquery('english', ${tsquery})
    ORDER BY ts_rank(d.search_rank_vector, websearch_to_tsquery('english', ${tsquery})) DESC
    LIMIT ${ALIAS_ARM_LIMIT}`;
}

/**
 * Build one alias arm query for explore retrieval: ids + snippet only (the
 * page fetch joins full row data afterwards).
 */
export function buildExploreAliasArmQuery(alias: ValidatedAlias, whereClause: SqlChunk): SqlChunk {
  const tsquery = quotedPhrase(alias.phrase);
  return sql`
    SELECT d.id,
      ts_headline('english', LEFT(d.content, ${HEADLINE_CONTENT_CHARS}),
        websearch_to_tsquery('english', ${tsquery}), ${HEADLINE_OPTS}) as match_snippet,
      ${alias.phrase} as matched_alias
    FROM documents d
    LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
    WHERE ${whereClause}
      AND d.search_rank_vector IS NOT NULL
      AND d.search_vector @@ websearch_to_tsquery('english', ${tsquery})
    ORDER BY ts_rank(d.search_rank_vector, websearch_to_tsquery('english', ${tsquery})) DESC
    LIMIT ${ALIAS_ARM_LIMIT}`;
}

/** Execute alias arms sequentially, tolerating per-arm failures. */
export async function runArms(queries: SqlChunk[]): Promise<Record<string, unknown>[][]> {
  const db = getDb();
  const results: Record<string, unknown>[][] = [];
  for (const q of queries) {
    try {
      results.push((await db.execute(q)).rows as Record<string, unknown>[]);
    } catch (err) {
      console.warn('[hybrid-arms] alias arm failed (skipped):', err);
      results.push([]);
    }
  }
  return results;
}
