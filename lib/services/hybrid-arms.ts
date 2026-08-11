/**
 * Per-alias full-text-search arms for hybrid retrieval (#702).
 *
 * Each corpus-validated alias runs as its own ranked arm: matching uses the
 * full generated search_vector (GIN, fast); ORDER BY ranks on the compact
 * search_rank_vector so ts_rank never detoasts multi-MB vectors — rows
 * awaiting the rank-vector backfill are simply not FTS candidates yet
 * (graceful pre-backfill degradation).
 *
 * Matched-passage snippets (ts_headline) are deliberately NOT computed in
 * the arm queries: arms fetch up to 8×40 candidates and fusion discards most
 * of them, so headlines run afterwards — one batched query for only the
 * keyword docs that made the final result (fetchMatchSnippets).
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';

type SqlChunk = ReturnType<typeof sql>;

/** FTS candidates fetched per alias arm (canary-validated depth). */
export const ALIAS_ARM_LIMIT = 40;
/** Hard bound on rows entering an arm's ts_rank sort — defense in depth
 *  against stale-cache aliases broader than current validation admits. */
const ALIAS_ARM_SCAN_LIMIT = 2000;
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
 * research projection (mapToResearchDoc-compatible) plus matched_alias.
 */
export function buildAliasArmQuery(
  alias: ValidatedAlias,
  vectorStr: string,
  candidateFilters: SqlChunk,
): SqlChunk {
  const tsquery = quotedPhrase(alias.phrase);
  // Inner bounded match scan (alias d, so shared filter chunks apply), then
  // rank-sort only those rows: caps detoast work no matter how common the
  // alias is (stale-cache aliases can exceed current validation caps).
  return sql`
    SELECT doc.id, doc.title, LEFT(doc.content, 3000) as content, doc.url, doc.published_at,
      doc.source_type, doc.source_origin, doc.case_id, doc.category,
      1 - (doc.embedding <=> ${vectorStr}::vector) as cosine_similarity,
      ds.final_score, ds.document_class,
      ai.assessment as p2_assessment, ai.erosion_type as p2_erosion_type,
      ai.confidence as p2_confidence, LEFT(ai.reasoning, 300) as p2_summary,
      ${alias.phrase} as matched_alias
    FROM (
      SELECT d.id FROM documents d
      WHERE ${candidateFilters}
        AND d.search_rank_vector IS NOT NULL
        AND d.search_vector @@ websearch_to_tsquery('english', ${tsquery})
      LIMIT ${ALIAS_ARM_SCAN_LIMIT}
    ) matches
    JOIN documents doc ON doc.id = matches.id
    LEFT JOIN document_scores ds ON ds.url = doc.url AND ds.category = doc.category
    LEFT JOIN ai_document_assessments ai
      ON ai.url = doc.url AND ai.category = doc.category AND ai.pass = 2
    ORDER BY ts_rank(doc.search_rank_vector, websearch_to_tsquery('english', ${tsquery})) DESC
    LIMIT ${ALIAS_ARM_LIMIT}`;
}

/**
 * Build one alias arm query for explore retrieval: ids + matched alias only
 * (the page fetch joins full row data, and snippets run post-pagination).
 */
export function buildExploreAliasArmQuery(alias: ValidatedAlias, whereClause: SqlChunk): SqlChunk {
  const tsquery = quotedPhrase(alias.phrase);
  // Inner scan keeps aliases d/ds so buildFilterConditions chunks apply.
  return sql`
    SELECT doc.id, ${alias.phrase} as matched_alias
    FROM (
      SELECT d.id FROM documents d
      LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
      WHERE ${whereClause}
        AND d.search_rank_vector IS NOT NULL
        AND d.search_vector @@ websearch_to_tsquery('english', ${tsquery})
      LIMIT ${ALIAS_ARM_SCAN_LIMIT}
    ) matches
    JOIN documents doc ON doc.id = matches.id
    ORDER BY ts_rank(doc.search_rank_vector, websearch_to_tsquery('english', ${tsquery})) DESC
    LIMIT ${ALIAS_ARM_LIMIT}`;
}

/** Execute alias arms concurrently, tolerating per-arm failures. */
export async function runArms(queries: SqlChunk[]): Promise<Record<string, unknown>[][]> {
  const db = getDb();
  return Promise.all(
    queries.map(async (q) => {
      try {
        return (await db.execute(q)).rows as Record<string, unknown>[];
      } catch (err) {
        console.warn('[hybrid-arms] alias arm failed (skipped):', err);
        return [];
      }
    }),
  );
}

/**
 * Batched matched-passage extraction for the docs that survived fusion: one
 * ts_headline query for (id, alias) pairs instead of headlining every arm
 * candidate. Failure-tolerant — snippets are enrichment, not retrieval.
 */
export async function fetchMatchSnippets(
  pairs: Array<{ id: number; phrase: string }>,
): Promise<Map<number, string>> {
  if (pairs.length === 0) return new Map();
  const db = getDb();
  const values = sql.join(
    pairs.map((p) => sql`(${p.id}::int, ${quotedPhrase(p.phrase)})`),
    sql`, `,
  );
  try {
    const rows = await db.execute(sql`
      SELECT d.id, ts_headline('english', LEFT(d.content, ${HEADLINE_CONTENT_CHARS}),
        websearch_to_tsquery('english', v.q), ${HEADLINE_OPTS}) as match_snippet
      FROM (VALUES ${values}) AS v(id, q)
      JOIN documents d ON d.id = v.id`);
    return new Map(
      (rows.rows as Array<{ id: number; match_snippet: string | null }>)
        .filter((r) => r.match_snippet)
        .map((r) => [Number(r.id), r.match_snippet as string]),
    );
  } catch (err) {
    console.warn('[hybrid-arms] snippet batch failed (results ship without snippets):', err);
    return new Map();
  }
}
