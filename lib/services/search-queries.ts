/**
 * Search query builders and execution helpers for search-service.ts.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  countDistinctDocs,
  fetchRowsForDocKeys,
  orderedUniqueDocKeys,
  pageDocKeysBySql,
} from '@/lib/services/explore-document-paging';
import type { ExploreSearchResult, SearchFilters, SearchResultDocument } from './search-service';

const VECTOR_CANDIDATE_LIMIT = 500;

/** Origins stored but excluded from all analysis and search (legacy). */
export const SEARCH_EXCLUDED_ORIGINS = ['gdelt', 'whitehouse'] as const;

export function buildFilterConditions(filters: SearchFilters): ReturnType<typeof sql>[] {
  // Unconditional exclusions: annotated off-topic docs (#544), body-less
  // metadata records, the intent-assessment working set (internal analysis
  // plumbing under the non-monitored 'intent' category, null source_origin),
  // and legacy origins — every searchable doc belongs to a listed source.
  const conditions: ReturnType<typeof sql>[] = [
    sql`d.retrieval_relevant IS NOT FALSE`,
    sql`d.content_type != 'metadata_only'`,
    sql`d.category != 'intent'`,
    sql`d.source_origin IS NOT NULL`,
    sql`d.source_origin NOT IN ('gdelt', 'whitehouse')`,
  ];

  if (filters.category) {
    conditions.push(sql`d.category = ${filters.category}`);
  }
  if (filters.dateFrom) {
    conditions.push(sql`d.published_at >= ${filters.dateFrom}::timestamptz`);
  }
  if (filters.dateTo) {
    conditions.push(sql`d.published_at <= ${filters.dateTo}::timestamptz`);
  }
  if (filters.sourceOrigin) {
    conditions.push(sql`d.source_origin = ${filters.sourceOrigin}`);
  }
  if (filters.scoreMin != null) {
    conditions.push(sql`ds.final_score >= ${filters.scoreMin}`);
  }
  if (filters.scoreMax != null) {
    conditions.push(sql`ds.final_score <= ${filters.scoreMax}`);
  }
  if (filters.documentClass) {
    conditions.push(sql`ds.document_class = ${filters.documentClass}`);
  }

  return conditions;
}

export function mapToSearchResult(row: Record<string, unknown>): SearchResultDocument {
  return {
    id: Number(row.id),
    title: row.title as string,
    url: row.url as string | null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    sourceType: row.source_type as string,
    sourceOrigin: row.source_origin as string | null,
    caseId: row.case_id as string | null,
    category: row.category as string,
    snippet: row.snippet as string | null,
    ...(row.match_snippet ? { matchSnippet: row.match_snippet as string } : {}),
    ...(row.matched_alias ? { matchedAlias: row.matched_alias as string } : {}),
    cosineSimilarity: row.cosine_similarity != null ? Number(row.cosine_similarity) : null,
    textRank: row.text_rank != null ? Number(row.text_rank) : null,
    severityScore: row.severity_score != null ? Number(row.severity_score) : null,
    finalScore: row.final_score != null ? Number(row.final_score) : null,
    documentClass: row.document_class as string | null,
    classMultiplier: row.class_multiplier != null ? Number(row.class_multiplier) : null,
    captureCount: row.capture_count != null ? Number(row.capture_count) : null,
    driftCount: row.drift_count != null ? Number(row.drift_count) : null,
    warningCount: row.warning_count != null ? Number(row.warning_count) : null,
    suppressedCount: row.suppressed_count != null ? Number(row.suppressed_count) : null,
    matches: row.matches as unknown[] | null,
    suppressed: row.suppressed as unknown[] | null,
    aiAssessment: row.ai_assessment as string | null,
    aiConfidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
    aiErosionType: row.ai_erosion_type as string | null,
    aiReasoning: row.ai_reasoning as string | null,
  };
}

// ---------------------------------------------------------------------------
// Explore execution helpers
// ---------------------------------------------------------------------------

/** Post-query AI enrichment — avoids expensive JOIN in the main query. */
export async function enrichWithAiAssessments(
  db: ReturnType<typeof getDb>,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  try {
    const aiResults = await db.execute(sql`
      SELECT url, category, assessment, confidence, erosion_type, LEFT(reasoning, 300) as reasoning
      FROM ai_document_assessments
      WHERE pass = 2 AND (url, category) IN (${sql.join(
        rows.map((r) => sql`(${r.url as string}, ${r.category as string})`),
        sql`, `,
      )})
    `);
    const aiMap = new Map<string, Record<string, unknown>>();
    for (const ai of aiResults.rows as Record<string, unknown>[]) {
      aiMap.set(`${ai.url}:${ai.category}`, ai);
    }
    for (const row of rows) {
      const ai = aiMap.get(`${row.url}:${row.category}`);
      row.ai_assessment = ai?.assessment ?? null;
      row.ai_confidence = ai?.confidence ?? null;
      row.ai_erosion_type = ai?.erosion_type ?? null;
      row.ai_reasoning = ai?.reasoning ?? null;
    }
  } catch (err) {
    console.error('[search] AI enrichment failed (non-fatal):', err);
  }
}

/** Order the in-memory vector candidates by the requested sort. Pure. */
function orderVectorCandidates<T extends { publishedAt: string | null; finalScore: number | null }>(
  candidates: T[],
  sort: string | undefined,
): T[] {
  if (sort === 'date') {
    return [...candidates].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  }
  if (sort === 'score') {
    return [...candidates].sort(
      (a, b) => (b.finalScore ?? -Infinity) - (a.finalScore ?? -Infinity),
    );
  }
  return candidates; // relevance: keep vector-similarity order
}

/** Vector-based explore: semantic candidate pool, paged over unique
 *  documents (#728) with every category row fetched for the page. */
export async function vectorExplore(
  db: ReturnType<typeof getDb>,
  vectorStr: string,
  filters: SearchFilters,
  page: number,
  pageSize: number,
  offset: number,
): Promise<ExploreSearchResult> {
  const whereParts: ReturnType<typeof sql>[] = [sql`d.embedding IS NOT NULL`];
  whereParts.push(...buildFilterConditions(filters));
  const whereClause = sql.join(whereParts, sql` AND `);

  const candidateRows = await db.execute(sql`
    SELECT d.id, d.url, d.published_at, ds.final_score
    FROM documents d
    LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
    WHERE ${whereClause}
    ORDER BY d.embedding <=> ${vectorStr}::vector
    LIMIT ${VECTOR_CANDIDATE_LIMIT}`);
  const candidates = (candidateRows.rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    url: r.url as string | null,
    publishedAt: r.published_at ? String(r.published_at) : null,
    finalScore: r.final_score != null ? Number(r.final_score) : null,
  }));

  const docKeys = orderedUniqueDocKeys(orderVectorCandidates(candidates, filters.sort));
  const totalResults = docKeys.length;
  const pageKeys = docKeys.slice(offset, offset + pageSize);

  const rows = await fetchRowsForDocKeys(db, pageKeys, whereClause, vectorStr, filters.query);
  await enrichWithAiAssessments(db, rows);
  return { totalResults, page, pageSize, documents: rows.map(mapToSearchResult) };
}

/** Text-based explore fallback: tsvector keyword search when embedding is
 *  unavailable. Counts and pages over unique documents in SQL (#728) — this
 *  path's candidate set is unbounded, so dedupe cannot happen in memory. */
export async function textExplore(
  db: ReturnType<typeof getDb>,
  filters: SearchFilters,
  hasQuery: boolean,
  page: number,
  pageSize: number,
  offset: number,
): Promise<ExploreSearchResult> {
  const parts: ReturnType<typeof sql>[] = [];
  if (hasQuery) {
    parts.push(sql`d.search_vector @@ websearch_to_tsquery('english', ${filters.query})`);
  }
  parts.push(...buildFilterConditions(filters));
  const whereClause = parts.length > 0 ? sql.join(parts, sql` AND `) : sql`TRUE`;

  const sortCol =
    filters.sort === 'score'
      ? sql`ds.final_score`
      : filters.sort !== 'date' && hasQuery
        ? sql`ts_rank_cd(d.search_vector, websearch_to_tsquery('english', ${filters.query}))`
        : sql`d.published_at`;

  const [totalResults, pageKeys] = await Promise.all([
    countDistinctDocs(db, whereClause),
    pageDocKeysBySql(db, whereClause, sortCol, 'DESC', pageSize, offset),
  ]);

  const rows = await fetchRowsForDocKeys(
    db,
    pageKeys,
    whereClause,
    null,
    hasQuery ? filters.query : '',
  );
  await enrichWithAiAssessments(db, rows);
  return { totalResults, page, pageSize, documents: rows.map(mapToSearchResult) };
}
