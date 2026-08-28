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
import {
  dropBoilerplateFragments,
  headlineSourceSql,
} from '@/lib/services/synthesis-context-enrichment';

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
/** Context on each side of the literal phrase occurrence in an excerpt —
 *  wide enough that "show more context" is worth clicking (#728). */
const SNIPPET_CONTEXT_CHARS = 600;

function quotedPhrase(phrase: string): string {
  return `"${phrase.replace(/"/g, '')}"`;
}

/**
 * Build one alias arm query for research retrieval — ids + source_type +
 * matched alias ONLY. Arms must never materialize content or embeddings:
 * a content prefix on a compressed multi-MB row decompresses the whole row,
 * and 8 arms x 40 rows of old-era CREC measured ~50s on prod (#705).
 * Fusion's winners are hydrated once afterwards (fetchResearchDocRowsByIds).
 * source_type is carried so the all-tier path can split hits per tier pool.
 */
export function buildAliasArmQuery(alias: ValidatedAlias, candidateFilters: SqlChunk): SqlChunk {
  const tsquery = quotedPhrase(alias.phrase);
  // Inner bounded match scan (alias d, so shared filter chunks apply), then
  // rank-sort only those rows: caps detoast work no matter how common the
  // alias is (stale-cache aliases can exceed current validation caps).
  return sql`
    SELECT doc.id, doc.source_type, ${alias.phrase} as matched_alias
    FROM (
      SELECT d.id FROM documents d
      WHERE ${candidateFilters}
        AND d.search_rank_vector IS NOT NULL
        AND d.search_vector @@ websearch_to_tsquery('english', ${tsquery})
      LIMIT ${ALIAS_ARM_SCAN_LIMIT}
    ) matches
    JOIN documents doc ON doc.id = matches.id
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

/**
 * Batched matched-passage extraction for the docs that survived fusion —
 * failure-tolerant (snippets are enrichment, not retrieval).
 *
 * The excerpt is a window CENTERED ON THE FIRST LITERAL OCCURRENCE of the
 * phrase (#728): ts_headline ranks fragments by query-word density, not
 * phrase coverage, so it could pick passages full of the phrase's words
 * that never contain the phrase — the excerpt then failed to show what
 * "Matched passage" claimed. ts_headline remains the fallback for
 * stemming-only matches with no literal occurrence. The window carries
 * SNIPPET_CONTEXT_CHARS of context each side; the UI clamps display and
 * offers "show more context".
 */
export async function fetchMatchSnippets(
  pairs: Array<{ id: number; phrase: string }>,
): Promise<Map<number, string>> {
  if (pairs.length === 0) return new Map();
  const db = getDb();
  const values = sql.join(
    pairs.map((p) => sql`(${p.id}::int, ${quotedPhrase(p.phrase)}, ${p.phrase})`),
    sql`, `,
  );
  try {
    // Both the literal window and the headline fallback read the
    // masthead-skipped source (#744): the GPO header names agencies and
    // dates, so a phrase's FIRST occurrence was often inside it.
    const rows = await db.execute(sql`
      SELECT d.id,
        CASE WHEN loc.pos > 0 THEN
          (CASE WHEN loc.start_at > 1 THEN '… ' ELSE '' END)
          || substring(src.body FROM loc.start_at FOR loc.win_len)
          || (CASE WHEN loc.start_at + loc.win_len <= char_length(src.body) THEN ' …' ELSE '' END)
        ELSE ts_headline('english', src.body,
          websearch_to_tsquery('english', v.q), ${HEADLINE_OPTS})
        END as match_snippet
      FROM (VALUES ${values}) AS v(id, q, phrase)
      JOIN documents d ON d.id = v.id
      CROSS JOIN LATERAL (SELECT ${headlineSourceSql(HEADLINE_CONTENT_CHARS)} AS body) src
      CROSS JOIN LATERAL (
        SELECT p.pos,
          greatest(p.pos - ${SNIPPET_CONTEXT_CHARS}, 1) AS start_at,
          (p.pos - greatest(p.pos - ${SNIPPET_CONTEXT_CHARS}, 1))
            + char_length(v.phrase) + ${SNIPPET_CONTEXT_CHARS} AS win_len
        FROM (SELECT position(lower(v.phrase) IN lower(src.body)) AS pos) p
      ) loc`);
    return new Map(
      (rows.rows as Array<{ id: number; match_snippet: string | null }>)
        .map(
          (r) =>
            [
              Number(r.id),
              r.match_snippet ? dropBoilerplateFragments(r.match_snippet) : null,
            ] as const,
        )
        .filter((entry): entry is readonly [number, string] => !!entry[1]),
    );
  } catch (err) {
    console.warn('[hybrid-arms] snippet batch failed (results ship without snippets):', err);
    return new Map();
  }
}
