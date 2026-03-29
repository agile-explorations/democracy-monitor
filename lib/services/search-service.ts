/**
 * Search service — semantic vector search with filters, pagination, and scoring details.
 *
 * Supports two modes:
 * - Explore: vector semantic search (pgvector) with filters, tsvector fallback
 * - Research: vector search against government documents for RAG synthesis
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { embedText } from './embedding-service';
import { mapToSearchResult, textExplore, vectorExplore } from './search-queries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchFilters {
  query: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  sourceOrigin?: string;
  scoreMin?: number;
  scoreMax?: number;
  documentClass?: string;
  sort?: 'relevance' | 'date' | 'score';
  page?: number;
  pageSize?: number;
}

export interface SearchResultDocument {
  id: number;
  title: string;
  url: string | null;
  publishedAt: string | null;
  sourceType: string;
  sourceOrigin: string | null;
  category: string;
  snippet: string | null;
  cosineSimilarity: number | null;
  textRank: number | null;
  severityScore: number | null;
  finalScore: number | null;
  documentClass: string | null;
  classMultiplier: number | null;
  captureCount: number | null;
  driftCount: number | null;
  warningCount: number | null;
  suppressedCount: number | null;
  matches: unknown[] | null;
  suppressed: unknown[] | null;
  aiAssessment: string | null;
  aiConfidence: number | null;
  aiErosionType: string | null;
  aiReasoning: string | null;
}

export interface ExploreSearchResult {
  totalResults: number;
  page: number;
  pageSize: number;
  documents: SearchResultDocument[];
}

export interface ResearchDocument {
  id: number;
  title: string;
  content: string | null;
  url: string | null;
  publishedAt: string | null;
  sourceType: string;
  sourceOrigin: string | null;
  category: string;
  cosineSimilarity: number;
  finalScore: number | null;
  documentClass: string | null;
  p2Assessment: string | null;
  p2ErosionType: string | null;
  p2Confidence: number | null;
  p2Summary: string | null;
}

export interface SimilarDocumentResult {
  sameCategory: SearchResultDocument[];
  otherCategories: SearchResultDocument[];
}

// ---------------------------------------------------------------------------
// Explore mode: vector semantic search with filters (tsvector fallback)
// ---------------------------------------------------------------------------

export async function searchExplore(filters: SearchFilters): Promise<ExploreSearchResult> {
  if (!isDbAvailable()) return { totalResults: 0, page: 1, pageSize: 20, documents: [] };

  const db = getDb();
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;
  const hasQuery = filters.query.trim().length > 0;

  // Embed every query for semantic search (no minimum word count)
  let vectorStr: string | null = null;
  if (hasQuery) {
    const embedding = await embedText(filters.query);
    if (embedding) vectorStr = `[${embedding.join(',')}]`;
  }

  try {
    if (vectorStr) {
      return await vectorExplore(db, vectorStr, filters, page, pageSize, offset);
    }
    return await textExplore(db, filters, hasQuery, page, pageSize, offset);
  } catch (err) {
    console.error('[search] Explore search failed:', err);
    return { totalResults: 0, page, pageSize, documents: [] };
  }
}

// ---------------------------------------------------------------------------
// Research mode: vector search for government documents
// ---------------------------------------------------------------------------

/** Build the research vector search SQL (candidates → dedup → re-rank → P2 join). */
function buildResearchQuery(
  vectorStr: string,
  query: string,
  topK: number,
  candidateLimit: number,
) {
  return sql`
    SELECT r.*, ai.assessment as p2_assessment, ai.erosion_type as p2_erosion_type,
      ai.confidence as p2_confidence, LEFT(ai.reasoning, 300) as p2_summary
    FROM (
      SELECT id, title, content, url, published_at, source_type, source_origin, category,
        cosine_similarity, final_score, document_class,
        (cosine_similarity * 0.6 + recency * 0.2
          + CASE WHEN keyword_match THEN 0.2 ELSE 0 END) as combined_score
      FROM (
        SELECT DISTINCT ON (url)
          id, title, content, url, published_at, source_type, source_origin, category,
          cosine_similarity, final_score, document_class, recency, keyword_match
        FROM (
          SELECT d.id, d.title, d.content, d.url, d.published_at, d.source_type,
            d.source_origin, d.category,
            1 - (d.embedding <=> ${vectorStr}::vector) as cosine_similarity,
            ds.final_score, ds.document_class,
            CASE WHEN d.published_at IS NULL THEN 0
              ELSE GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - d.published_at))
                / (365.25 * 86400 * 4))
            END as recency,
            (d.search_vector @@ websearch_to_tsquery('english', ${query})) as keyword_match
          FROM documents d
          LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
          WHERE d.embedding IS NOT NULL
            AND d.source_origin NOT IN ('gdelt', 'whitehouse')
          ORDER BY d.embedding <=> ${vectorStr}::vector
          LIMIT ${candidateLimit}
        ) candidates
        ORDER BY url, cosine_similarity DESC
      ) deduped
      ORDER BY combined_score DESC
      LIMIT ${topK}
    ) r
    LEFT JOIN ai_document_assessments ai
      ON ai.url = r.url AND ai.category = r.category AND ai.pass = 2
  `;
}

export async function searchResearch(
  query: string,
  topK = 20,
  precomputedEmbedding?: number[],
): Promise<ResearchDocument[]> {
  if (!isDbAvailable()) return [];
  const embedding = precomputedEmbedding ?? (await embedText(query));
  if (!embedding) return [];

  const db = getDb();
  const vectorStr = `[${embedding.join(',')}]`;

  try {
    const results = await db.execute(buildResearchQuery(vectorStr, query, topK, topK * 5));
    return (results.rows as Record<string, unknown>[]).map(mapToResearchDoc);
  } catch (err) {
    console.error('[search] Research search failed:', err);
    return [];
  }
}

function mapToResearchDoc(row: Record<string, unknown>): ResearchDocument {
  return {
    id: Number(row.id),
    title: row.title as string,
    content: row.content as string | null,
    url: row.url as string | null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    sourceType: row.source_type as string,
    sourceOrigin: row.source_origin as string | null,
    category: row.category as string,
    cosineSimilarity: Number(row.cosine_similarity),
    finalScore: row.final_score != null ? Number(row.final_score) : null,
    documentClass: row.document_class as string | null,
    p2Assessment: (row.p2_assessment as string) ?? null,
    p2ErosionType: (row.p2_erosion_type as string) ?? null,
    p2Confidence: row.p2_confidence != null ? Number(row.p2_confidence) : null,
    p2Summary: (row.p2_summary as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Similar documents
// ---------------------------------------------------------------------------

export async function findSimilarDocuments(
  documentId: number,
  limit = 5,
): Promise<SimilarDocumentResult> {
  if (!isDbAvailable()) return { sameCategory: [], otherCategories: [] };
  const db = getDb();

  try {
    const source = await db.execute(
      sql`SELECT embedding, category FROM documents WHERE id = ${documentId} AND embedding IS NOT NULL LIMIT 1`,
    );
    if (source.rows.length === 0) return { sameCategory: [], otherCategories: [] };

    const { embedding: vectorStr, category: sourceCategory } = source.rows[0] as {
      embedding: string;
      category: string;
    };

    const fetchSimilar = (catCondition: ReturnType<typeof sql>) =>
      db.execute(sql`
        SELECT d.id, d.title, d.url, d.published_at, d.source_type, d.source_origin, d.category,
          LEFT(d.content, 250) as snippet, 1 - (d.embedding <=> ${vectorStr}::vector) as cosine_similarity,
          NULL as text_rank, ds.severity_score, ds.final_score, ds.document_class, ds.class_multiplier,
          ds.capture_count, ds.drift_count, ds.warning_count, ds.suppressed_count, ds.matches, ds.suppressed,
          ai.assessment as ai_assessment, ai.confidence as ai_confidence,
          ai.erosion_type as ai_erosion_type, ai.reasoning as ai_reasoning
        FROM documents d
        LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
        LEFT JOIN ai_document_assessments ai ON ai.url = d.url AND ai.category = d.category AND ai.pass = 2
        WHERE d.embedding IS NOT NULL AND d.id != ${documentId} AND ${catCondition}
        ORDER BY d.embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `);

    const [sameCat, otherCat] = await Promise.all([
      fetchSimilar(sql`d.category = ${sourceCategory}`),
      fetchSimilar(sql`d.category != ${sourceCategory}`),
    ]);

    return {
      sameCategory: (sameCat.rows as Record<string, unknown>[]).map(mapToSearchResult),
      otherCategories: (otherCat.rows as Record<string, unknown>[]).map(mapToSearchResult),
    };
  } catch (err) {
    console.error('[search] Similar documents search failed:', err);
    return { sameCategory: [], otherCategories: [] };
  }
}
