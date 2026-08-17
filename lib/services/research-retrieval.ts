/**
 * Research retrieval support (#552): HNSW iterative-scan execution for
 * filtered vector queries, deterministic doc-id fetch for the two-phase
 * research flow (docsOnly citations → synthesis stream), and the research
 * candidate query builder (relocated from search-service.ts, #702).
 */

import { sql } from 'drizzle-orm';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { DISCUSSION_SOURCE_TYPES } from '@/lib/data/document-tiers';
import { PROCEDURAL_TITLE_PATTERN, PROCEDURAL_TITLE_PENALTY } from '@/lib/data/procedural-titles';
import { getDb, isDbAvailable } from '@/lib/db';
import { SEARCH_EXCLUDED_ORIGINS } from '@/lib/services/search-queries';
import { halfvecDistanceDoc } from '@/lib/services/vector-expr';
import { buildPublishedAtWindow } from '@/lib/utils/date-window';

/**
 * Fetch research document rows by id, preserving the input order. Phase 2
 * (the synthesis stream) uses this to consume EXACTLY the doc set and
 * ordering that phase 1 returned for citations — the two phases previously
 * ran independent retrievals whose agreement was accidental. Returns raw rows
 * in the research-query column shape; the caller maps them.
 */
export async function fetchResearchDocRowsByIds(
  ids: number[],
  vectorStr?: string,
): Promise<Record<string, unknown>[]> {
  if (!isDbAvailable() || ids.length === 0) return [];
  const db = getDb();
  const cosineExpr = vectorStr ? sql`1 - (d.embedding <=> ${vectorStr}::vector)` : sql`0`;
  try {
    const results = await db.execute(sql`
      SELECT d.id, d.title, LEFT(d.content, 3000) as content, d.url, d.published_at, d.source_type,
        d.source_origin, d.case_id, d.category,
        ${cosineExpr} as cosine_similarity, ds.final_score, ds.document_class,
        ai.assessment as p2_assessment, ai.erosion_type as p2_erosion_type,
        ai.confidence as p2_confidence, LEFT(ai.reasoning, 300) as p2_summary
      FROM documents d
      LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
      LEFT JOIN ai_document_assessments ai
        ON ai.url = d.url AND ai.category = d.category AND ai.pass = 2
      WHERE d.id IN (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )})
    `);
    const byId = new Map((results.rows as Record<string, unknown>[]).map((r) => [Number(r.id), r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is Record<string, unknown> => r !== undefined);
  } catch (err) {
    console.error('[search] fetchResearchDocRowsByIds failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Research candidate query builder (#702) — relocated from search-service.ts.
// ---------------------------------------------------------------------------

export interface ResearchQueryOpts {
  topK: number;
  dateFrom?: string;
  dateTo?: string;
  tier?: DocumentTier;
}

/** Tier condition for the research candidate scan (#552). */
function buildTierFilter(tier?: DocumentTier) {
  if (!tier) return sql``;
  const types = sql.join(
    [...DISCUSSION_SOURCE_TYPES].map((t) => sql`${t}`),
    sql`, `,
  );
  return tier === 'action'
    ? sql`AND d.source_type NOT IN (${types})`
    : sql`AND d.source_type IN (${types})`;
}

/** Joined list of legacy origins excluded from all search retrieval. */
function excludedOrigins() {
  return sql.join(
    SEARCH_EXCLUDED_ORIGINS.map((o) => sql`${o}`),
    sql`, `,
  );
}

/** Combined ranking score: semantic similarity, recency, keyword hit, minus
 *  the procedural-boilerplate penalty (#593). */
const COMBINED_SCORE = sql`(cosine_similarity * 0.6 + recency * 0.2
  + CASE WHEN keyword_match THEN 0.2 ELSE 0 END
  - CASE WHEN procedural THEN ${PROCEDURAL_TITLE_PENALTY}::numeric ELSE 0 END)`;

/**
 * Shared candidate filter set — used by the vector candidate scan AND the
 * per-alias FTS arms (#702) so both arms search exactly the same population.
 */
export function researchCandidateFilters(dateFrom?: string, dateTo?: string, tier?: DocumentTier) {
  return sql`d.embedding IS NOT NULL
    AND d.source_origin NOT IN (${excludedOrigins()})
    AND d.retrieval_relevant IS NOT FALSE
    AND d.content_type != 'metadata_only'
    ${buildPublishedAtWindow(dateFrom, dateTo)}
    ${buildTierFilter(tier)}`;
}

/** Build the research vector search SQL (candidates → dedup → re-rank → P2 join). */
export function buildResearchQuery(vectorStr: string, query: string, opts: ResearchQueryOpts) {
  const { topK, dateFrom, dateTo, tier } = opts;
  const candidateLimit = topK * 5;

  // Candidate stages carry only ids + ranking inputs; content is joined back
  // for the final topK rows only, capped at 3000 chars (the prompt uses at
  // most ACTION_EXCERPT_CHARS=2200). Shipping full opinion texts (up to ~1MB
  // each) over the wire measured ~8-10s of the retrieval latency.
  return sql`
    SELECT r.id, d2.title, LEFT(d2.content, 3000) as content, d2.url, d2.published_at, d2.source_type,
      d2.source_origin, d2.case_id, d2.category, r.cosine_similarity, r.final_score, r.document_class,
      ai.assessment as p2_assessment, ai.erosion_type as p2_erosion_type,
      ai.confidence as p2_confidence, LEFT(ai.reasoning, 300) as p2_summary
    FROM (
      SELECT id, url, category, cosine_similarity, final_score, document_class,
        ${COMBINED_SCORE} as combined_score
      FROM (
        SELECT DISTINCT ON (url)
          id, url, category, cosine_similarity, final_score, document_class, recency, keyword_match,
          procedural
        FROM (
          SELECT d.id, d.url, d.category,
            1 - (d.embedding <=> ${vectorStr}::vector) as cosine_similarity,
            ds.final_score, ds.document_class,
            d.title ~* ${PROCEDURAL_TITLE_PATTERN} as procedural,
            CASE WHEN d.published_at IS NULL THEN 0
              ELSE GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - d.published_at))
                / (365.25 * 86400 * 4))
            END as recency,
            (d.search_vector @@ websearch_to_tsquery('english', ${query})) as keyword_match
          FROM documents d
          LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
          WHERE ${researchCandidateFilters(dateFrom, dateTo, tier)}
          ORDER BY ${halfvecDistanceDoc(vectorStr)}
          LIMIT ${candidateLimit}
        ) candidates
        ORDER BY url, cosine_similarity DESC
      ) deduped
      ORDER BY combined_score DESC
      LIMIT ${topK}
    ) r
    JOIN documents d2 ON d2.id = r.id
    LEFT JOIN ai_document_assessments ai
      ON ai.url = r.url AND ai.category = r.category AND ai.pass = 2
    ORDER BY r.combined_score DESC
  `;
}
