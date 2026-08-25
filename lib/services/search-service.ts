/**
 * Search service — semantic vector search with filters, pagination, and scoring details.
 *
 * Supports two modes:
 * - Explore: vector semantic search (pgvector) with filters, tsvector fallback
 * - Research: vector search against government documents for RAG synthesis
 */

import { sql } from 'drizzle-orm';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { composeTieredResults, tierForSourceType } from '@/lib/data/document-tiers';
import { getDb, isDbAvailable } from '@/lib/db';
import type {
  ExploreSearchResult,
  ResearchDocument,
  SearchFilters,
  SimilarDocumentResult,
} from '@/lib/types/search';
import { stripBoilerplate } from '@/lib/utils/content-cleaners';
import { embedQueryCached } from './embedding-service';
import type { ExtractionConfig } from './entity-extraction';
import { mineArmsFromCandidates } from './entity-mining';
import { hybridVectorExplore } from './hybrid-explore';
import type { ValidatedAlias } from './query-expansion-service';
import { expandAndValidate } from './query-expansion-service';
import {
  armsForTier,
  attachMatchSnippets,
  fuseHydrateDedupe,
  runArmsForAliases,
  runResearchAliasArms,
} from './research-fusion';
import { buildResearchQuery, fetchResearchDocRowsByIds } from './research-retrieval';
import { mapToSearchResult, textExplore, vectorExplore } from './search-queries';
import {
  searchResearchAllTiers,
  searchSingleTierWithMeta,
  timedStage,
} from './search-research-tiers';
import type { SeedStageTiming } from './search-research-tiers';
import { executeFilteredVectorQuery, halfvecDistanceDoc } from './vector-expr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  ExploreSearchResult,
  ResearchDocument,
  SearchFilters,
  SearchResultDocument,
  SimilarDocumentResult,
} from '@/lib/types/search';
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
    const embedding = await embedQueryCached(filters.query);
    if (embedding) vectorStr = `[${embedding.join(',')}]`;
  }

  try {
    if (vectorStr) {
      // Hybrid path (#702): corpus-validated aliases add keyword arms; zero
      // aliases (no key, LLM failure, nothing validated) → pure vector.
      const aliases = await expandAndValidate(filters.query, {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        category: filters.category,
      });
      if (aliases.length > 0) {
        return await hybridVectorExplore(db, vectorStr, filters, aliases, page, pageSize, offset);
      }
      return await vectorExplore(db, vectorStr, filters, page, pageSize, offset);
    }
    return await textExplore(db, filters, hasQuery, page, pageSize, offset);
  } catch (err) {
    // #598: a failed query must surface as an error, never as an empty result
    // set — the #593 incident rendered a broken ranking query as "no matching
    // documents" for every user. The API layer converts throws to HTTP 500.
    console.error('[search] Explore search failed:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Research mode: hybrid vector + validated-alias retrieval (#702)
// ---------------------------------------------------------------------------

export type ResearchTierFilter = 'all' | DocumentTier;

export async function searchResearch(
  query: string,
  topK = 30,
  precomputedEmbedding?: number[],
  dateFrom?: string,
  dateTo?: string,
  tierFilter: ResearchTierFilter = 'all',
): Promise<ResearchDocument[]> {
  return (
    await searchResearchWithMeta(query, topK, precomputedEmbedding, dateFrom, dateTo, tierFilter)
  ).documents;
}

/** searchResearch plus the corpus-mined aliases (#750), so callers can
 *  surface mined phrases in the transparency chips and quote-verifier
 *  exemptions alongside the LLM-proposed terms. `extraAliases` (#756) are
 *  pre-validated follow-up phrases from the read loop, run as extra arms. */
export async function searchResearchWithMeta(
  query: string,
  topK = 30,
  precomputedEmbedding?: number[],
  dateFrom?: string,
  dateTo?: string,
  tierFilter: ResearchTierFilter = 'all',
  extraAliases?: ValidatedAlias[],
  // #762: enumeration builds pass ENUM_EXTRACTION; absent = LIGHT =
  // analytical byte-identical.
  miningConfig?: ExtractionConfig,
  // #780 WP1b: caller-provided sink receives seed-internal stage rows
  // (all-tiers path only — the era path has its own window timings).
  stageSink?: SeedStageTiming[],
): Promise<{ documents: ResearchDocument[]; minedAliases: ValidatedAlias[] }> {
  if (!isDbAvailable()) return { documents: [], minedAliases: [] };
  const embedding = precomputedEmbedding ?? (await embedQueryCached(query));
  if (!embedding) return { documents: [], minedAliases: [] };

  const db = getDb();
  const vectorStr = `[${embedding.join(',')}]`;

  try {
    if (tierFilter !== 'all') {
      return await searchSingleTierWithMeta(
        db,
        query,
        vectorStr,
        topK,
        dateFrom,
        dateTo,
        tierFilter,
        extraAliases,
        miningConfig,
      );
    }
    const { documents, minedAliases } = await searchResearchAllTiers(
      db,
      query,
      vectorStr,
      topK,
      dateFrom,
      dateTo,
      extraAliases,
      miningConfig,
      stageSink,
    );
    const withSnippets = await timedStage('seed-snippets', stageSink, () =>
      attachMatchSnippets(documents),
    );
    return { documents: withSnippets, minedAliases };
  } catch (err) {
    // #598: throw, never return [] — see searchExplore's catch for rationale.
    console.error('[search] Research search failed:', err);
    throw err;
  }
}

/** Fetch research documents by id, preserving input order (#552). */
export async function fetchResearchDocsByIds(ids: number[]): Promise<ResearchDocument[]> {
  const rows = await fetchResearchDocRowsByIds(ids);
  return rows.map(mapToResearchDoc);
}

export function mapToResearchDoc(row: Record<string, unknown>): ResearchDocument {
  return {
    id: Number(row.id),
    title: row.title as string,
    // Read-time boilerplate strip (#736): storage keeps full originals
    // (R-CONTENT), but CSS-contaminated CPD vintages must not spend the
    // synthesis excerpt budget on style rules.
    content: row.content
      ? stripBoilerplate(
          row.content as string,
          (row.source_origin as string | null) ?? null,
          row.title as string,
        )
      : null,
    url: row.url as string | null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    sourceType: row.source_type as string,
    tier: tierForSourceType(row.source_type as string),
    sourceOrigin: row.source_origin as string | null,
    caseId: row.case_id as string | null,
    category: row.category as string,
    cosineSimilarity: Number(row.cosine_similarity),
    finalScore: row.final_score != null ? Number(row.final_score) : null,
    documentClass: row.document_class as string | null,
    p2Assessment: (row.p2_assessment as string) ?? null,
    p2ErosionType: (row.p2_erosion_type as string) ?? null,
    p2Confidence: row.p2_confidence != null ? Number(row.p2_confidence) : null,
    p2Summary: (row.p2_summary as string) ?? null,
    ...(row.match_snippet ? { matchSnippet: row.match_snippet as string } : {}),
    ...(row.matched_alias ? { matchedAlias: row.matched_alias as string } : {}),
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
      executeFilteredVectorQuery(
        db,
        sql`
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
          AND d.retrieval_relevant IS NOT FALSE
        ORDER BY ${halfvecDistanceDoc(vectorStr)}
        LIMIT ${limit}
      `,
      );

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
