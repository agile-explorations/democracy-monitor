/**
 * Search query builders and execution helpers for search-service.ts.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { ExploreSearchResult, SearchFilters, SearchResultDocument } from './search-service';

const VECTOR_CANDIDATE_LIMIT = 500;

export function buildFilterConditions(filters: SearchFilters): ReturnType<typeof sql>[] {
  const conditions: ReturnType<typeof sql>[] = [];

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

export function buildSortClause(
  sort: string | undefined,
  hasSemantic: boolean,
  hasText: boolean,
): ReturnType<typeof sql> {
  switch (sort) {
    case 'date':
      return sql`d.published_at DESC NULLS LAST`;
    case 'score':
      return sql`ds.final_score DESC NULLS LAST`;
    case 'relevance':
    default:
      if (hasSemantic && hasText) {
        return sql`(COALESCE(text_rank, 0) * 0.4 + COALESCE(cosine_similarity, 0) * 0.6) DESC NULLS LAST`;
      }
      if (hasSemantic) return sql`cosine_similarity DESC NULLS LAST`;
      if (hasText) return sql`text_rank DESC NULLS LAST`;
      return sql`d.published_at DESC NULLS LAST`;
  }
}

export function mapToSearchResult(row: Record<string, unknown>): SearchResultDocument {
  return {
    id: Number(row.id),
    title: row.title as string,
    url: row.url as string | null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    sourceType: row.source_type as string,
    sourceOrigin: row.source_origin as string | null,
    category: row.category as string,
    snippet: row.snippet as string | null,
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

/** Vector-based explore: semantic search within a candidate pool, with filters and pagination. */
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

  const textRankExpr = sql`ts_rank_cd(d.search_vector, websearch_to_tsquery('english', ${filters.query}))`;
  const outerSort =
    filters.sort === 'date'
      ? sql`published_at DESC NULLS LAST`
      : filters.sort === 'score'
        ? sql`final_score DESC NULLS LAST`
        : sql`cosine_similarity DESC NULLS LAST`;

  const countResult = await db.execute(sql`
    SELECT count(*) as total FROM (
      SELECT 1 FROM documents d
      LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
      WHERE ${whereClause}
      ORDER BY d.embedding <=> ${vectorStr}::vector
      LIMIT ${VECTOR_CANDIDATE_LIMIT}
    ) c
  `);
  const totalResults = Number((countResult.rows[0] as { total: string }).total);

  const results = await db.execute(sql`
    SELECT * FROM (
      SELECT d.id, d.title, d.url, d.published_at, d.source_type, d.source_origin, d.category,
        LEFT(d.content, 250) as snippet,
        1 - (d.embedding <=> ${vectorStr}::vector) as cosine_similarity,
        ${textRankExpr} as text_rank,
        ds.severity_score, ds.final_score, ds.document_class, ds.class_multiplier,
        ds.capture_count, ds.drift_count, ds.warning_count, ds.suppressed_count,
        ds.matches, ds.suppressed
      FROM documents d
      LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
      WHERE ${whereClause}
      ORDER BY d.embedding <=> ${vectorStr}::vector
      LIMIT ${VECTOR_CANDIDATE_LIMIT}
    ) candidates
    ORDER BY ${outerSort}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const rows = results.rows as Record<string, unknown>[];
  await enrichWithAiAssessments(db, rows);
  return { totalResults, page, pageSize, documents: rows.map(mapToSearchResult) };
}

/** Text-based explore fallback: tsvector keyword search when embedding is unavailable. */
export async function textExplore(
  db: ReturnType<typeof getDb>,
  filters: SearchFilters,
  hasQuery: boolean,
  page: number,
  pageSize: number,
  offset: number,
): Promise<ExploreSearchResult> {
  const textRankCol = hasQuery
    ? sql`ts_rank_cd(d.search_vector, websearch_to_tsquery('english', ${filters.query}))`
    : sql`NULL`;
  const parts: ReturnType<typeof sql>[] = [];
  if (hasQuery) {
    parts.push(sql`d.search_vector @@ websearch_to_tsquery('english', ${filters.query})`);
  }
  parts.push(...buildFilterConditions(filters));
  const whereClause = parts.length > 0 ? sql.join(parts, sql` AND `) : sql`TRUE`;
  const sortClause = buildSortClause(filters.sort, false, hasQuery);

  const countResult = await db.execute(
    sql`SELECT count(*) as total FROM documents d LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category WHERE ${whereClause}`,
  );
  const totalResults = Number((countResult.rows[0] as { total: string }).total);

  const results = await db.execute(sql`
    SELECT d.id, d.title, d.url, d.published_at, d.source_type, d.source_origin, d.category,
      LEFT(d.content, 250) as snippet, NULL as cosine_similarity, ${textRankCol} as text_rank,
      ds.severity_score, ds.final_score, ds.document_class, ds.class_multiplier,
      ds.capture_count, ds.drift_count, ds.warning_count, ds.suppressed_count, ds.matches, ds.suppressed
    FROM documents d
    LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
    WHERE ${whereClause}
    ORDER BY ${sortClause}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const rows = results.rows as Record<string, unknown>[];
  await enrichWithAiAssessments(db, rows);
  return { totalResults, page, pageSize, documents: rows.map(mapToSearchResult) };
}
