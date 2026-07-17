/**
 * Research retrieval support (#552): HNSW iterative-scan execution for
 * filtered vector queries, and deterministic doc-id fetch for the two-phase
 * research flow (docsOnly citations → synthesis stream).
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';

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
        d.source_origin, d.category,
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
