/**
 * Research retrieval support (#552): HNSW iterative-scan execution for
 * filtered vector queries, and deterministic doc-id fetch for the two-phase
 * research flow (docsOnly citations → synthesis stream).
 */

import { sql } from 'drizzle-orm';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { DISCUSSION_SOURCE_TYPES } from '@/lib/data/document-tiers';
import { PROCEDURAL_TITLE_PATTERN, PROCEDURAL_TITLE_PENALTY } from '@/lib/data/procedural-titles';
import { getDb, isDbAvailable } from '@/lib/db';
import { SEARCH_EXCLUDED_ORIGINS } from '@/lib/services/search-queries';
import { buildPublishedAtWindow } from '@/lib/utils/date-window';

type Db = ReturnType<typeof getDb>;
type SqlQuery = ReturnType<typeof sql>;

/**
 * Execute a filtered vector query with HNSW iterative scanning. Tier/date
 * filters post-filter the HNSW candidate stream; at the default ef_search=40
 * a selective filter starves the result set (measured: 11 of 30 requested
 * action docs). pgvector 0.8's iterative scan keeps scanning until the LIMIT
 * is satisfied. SET LOCAL scopes the GUC to this transaction.
 */
export async function executeFilteredVectorQuery(db: Db, query: SqlQuery) {
  return db.transaction(async (tx) => {
    // NOTE: do NOT also raise hnsw.ef_search here — a larger ef multiplies the
    // per-batch cost of every iterative continuation (measured: ef=200 +
    // iterative = ~110s; iterative alone at default ef = ~1.4s, complete).
    await tx.execute(sql`SET LOCAL hnsw.iterative_scan = relaxed_order`);
    return tx.execute(query);
  });
}

/**
 * Fetch research document rows by id, preserving the input order. Phase 2
 * (the synthesis stream) uses this to consume EXACTLY the doc set and
 * ordering that phase 1 returned for citations — the two phases previously
 * ran independent retrievals whose agreement was accidental. Returns raw rows
 * in the research-query column shape; the caller maps them.
 */
export async function fetchResearchDocRowsByIds(ids: number[]): Promise<Record<string, unknown>[]> {
  if (!isDbAvailable() || ids.length === 0) return [];
  const db = getDb();
  try {
    const results = await db.execute(sql`
      SELECT d.id, d.title, LEFT(d.content, 3000) as content, d.url, d.published_at, d.source_type,
        d.source_origin, d.case_id, d.category,
        0 as cosine_similarity, ds.final_score, ds.document_class,
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
const buildDateFilter = buildPublishedAtWindow;

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

// Research candidate query (#702 hybrid retrieval) — relocated from
// search-service.ts (max-lines).
// ---------------------------------------------------------------------------
interface ResearchQueryOpts {
  topK: number;
  dateFrom?: string;
  dateTo?: string;
  tier?: DocumentTier;
}

/** Build the research vector search SQL (candidates → dedup → re-rank → P2 join). */
/** Combined ranking score: semantic similarity, recency, keyword hit, minus
 *  the procedural-boilerplate penalty (#593). */
/** Joined list of legacy origins excluded from all search retrieval. */
function excludedOrigins() {
  return sql.join(
    SEARCH_EXCLUDED_ORIGINS.map((o) => sql`${o}`),
    sql`, `,
  );
}

const COMBINED_SCORE = sql`(cosine_similarity * 0.6 + recency * 0.2
  + CASE WHEN keyword_match THEN 0.2 ELSE 0 END
  - CASE WHEN procedural THEN ${PROCEDURAL_TITLE_PENALTY}::numeric ELSE 0 END)`;

/** FTS candidates fetched alongside the vector arm (#702 hybrid retrieval). */
const FTS_CANDIDATE_LIMIT = 40;

interface CandidateArmParts {
  candidateRow: ReturnType<typeof sql>;
  candidateFilters: ReturnType<typeof sql>;
}

function buildCandidateParts(
  vectorStr: string,
  query: string,
  dateFilter: ReturnType<typeof sql>,
  tierFilter: ReturnType<typeof sql>,
): CandidateArmParts {
  // Shared per-row projection for both candidate arms.
  const candidateRow = sql`
            d.id, d.url, d.category,
            1 - (d.embedding <=> ${vectorStr}::vector) as cosine_similarity,
            ds.final_score, ds.document_class,
            d.title ~* ${PROCEDURAL_TITLE_PATTERN} as procedural,
            CASE WHEN d.published_at IS NULL THEN 0
              ELSE GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - d.published_at))
                / (365.25 * 86400 * 4))
            END as recency,
            (d.search_vector @@ websearch_to_tsquery('english', ${query})) as keyword_match`;
  const candidateFilters = sql`
            d.embedding IS NOT NULL
            AND d.source_origin NOT IN (${excludedOrigins()})
            AND d.retrieval_relevant IS NOT FALSE
            AND d.content_type != 'metadata_only'
            ${dateFilter}
            ${tierFilter}`;
  return { candidateRow, candidateFilters };
}

export function buildResearchQuery(vectorStr: string, query: string, opts: ResearchQueryOpts) {
  const { topK, dateFrom, dateTo, tier } = opts;
  const candidateLimit = topK * 5;
  const dateFilter = buildDateFilter(dateFrom, dateTo);
  const tierFilter = buildTierFilter(tier);
  const parts = buildCandidateParts(vectorStr, query, dateFilter, tierFilter);
  const { candidateRow, candidateFilters } = parts;

  // Candidate stages carry only ids + ranking inputs; content is joined back
  // for the final topK rows only, capped at 3000 chars (the prompt uses at
  // most ACTION_EXCERPT_CHARS=2200). Shipping full opinion texts (up to ~1MB
  // each) over the wire measured ~8-10s of the retrieval latency.
  //
  // Hybrid candidate generation (#702): the vector arm alone cannot surface
  // passage-level entity mentions (a Schedule F reference inside a nomination
  // speech doesn't move the speech's embedding), so a full-text-search arm is
  // unioned in. Matching uses the full generated search_vector (GIN, fast);
  // ORDER BY ranks on the compact search_rank_vector so ts_rank never
  // detoasts multi-MB vectors — rows awaiting the rank-vector backfill are
  // simply not FTS candidates yet (graceful pre-backfill degradation).
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
          (SELECT ${candidateRow}
          FROM documents d
          LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
          WHERE ${candidateFilters}
          ORDER BY d.embedding <=> ${vectorStr}::vector
          LIMIT ${candidateLimit})
          UNION ALL
          (SELECT ${candidateRow}
          FROM documents d
          LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
          WHERE ${candidateFilters}
            AND d.search_vector @@ websearch_to_tsquery('english', ${query})
            AND d.search_rank_vector IS NOT NULL
          ORDER BY ts_rank(d.search_rank_vector, websearch_to_tsquery('english', ${query})) DESC
          LIMIT ${FTS_CANDIDATE_LIMIT})
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
