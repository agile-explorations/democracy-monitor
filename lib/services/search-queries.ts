/**
 * Search query builders — SQL construction helpers for search-service.ts.
 */

import { sql } from 'drizzle-orm';
import type { SearchFilters, SearchResultDocument } from './search-service';

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
    if (filters.sourceOrigin === 'government') {
      conditions.push(sql`d.source_origin NOT IN ('gdelt', 'whitehouse')`);
    } else if (filters.sourceOrigin === 'news') {
      conditions.push(sql`d.source_origin IN ('gdelt', 'whitehouse')`);
    } else {
      conditions.push(sql`d.source_origin = ${filters.sourceOrigin}`);
    }
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
