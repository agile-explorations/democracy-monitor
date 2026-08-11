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
import { embedText } from './embedding-service';
import { buildAliasArmQuery, fetchMatchSnippets, runArms } from './hybrid-arms';
import { hybridVectorExplore } from './hybrid-explore';
import type { FusionArm } from './hybrid-fusion';
import { armWeight, dedupeByUrl, fuseWeightedRrf } from './hybrid-fusion';
import type { ValidatedAlias } from './query-expansion-service';
import { expandAndValidate } from './query-expansion-service';
import {
  buildResearchQuery,
  executeFilteredVectorQuery,
  fetchResearchDocRowsByIds,
  researchCandidateFilters,
} from './research-retrieval';
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
  caseId: string | null;
  category: string;
  snippet: string | null;
  /** Matched-passage excerpt (#702) — present when a keyword arm surfaced this doc. */
  matchSnippet?: string | null;
  /** The corpus-validated alias whose arm surfaced this doc (#702). */
  matchedAlias?: string | null;
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
  /** Corpus-validated alias terms the hybrid arms searched (#702) — for the
   *  "Also searched:" transparency chips. Absent on pure-vector fallback. */
  alsoSearched?: string[];
}

export interface ResearchDocument {
  id: number;
  title: string;
  content: string | null;
  url: string | null;
  publishedAt: string | null;
  sourceType: string;
  /** Action/discussion tier (#552) — derived from sourceType at map time. */
  tier: DocumentTier;
  sourceOrigin: string | null;
  caseId: string | null;
  category: string;
  cosineSimilarity: number;
  finalScore: number | null;
  documentClass: string | null;
  p2Assessment: string | null;
  p2ErosionType: string | null;
  p2Confidence: number | null;
  p2Summary: string | null;
  /** Matched-passage excerpt (#702) — present when a keyword arm surfaced this doc. */
  matchSnippet?: string;
  /** The corpus-validated alias whose arm surfaced this doc (#702). */
  matchedAlias?: string;
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

/**
 * Run the per-alias FTS arms for a research window and map rows into
 * weighted fusion arms. Alias failures degrade to empty arms; zero aliases
 * (no key, LLM failure, nothing validated) means pure-vector retrieval.
 */
async function runResearchAliasArms(
  query: string,
  vectorStr: string,
  dateFrom?: string,
  dateTo?: string,
  tier?: DocumentTier,
): Promise<{ aliases: ValidatedAlias[]; arms: FusionArm<ResearchDocument>[] }> {
  const aliases = await expandAndValidate(query, { dateFrom, dateTo, tier });
  if (aliases.length === 0) return { aliases, arms: [] };
  const filters = researchCandidateFilters(dateFrom, dateTo, tier);
  const rowLists = await runArms(aliases.map((a) => buildAliasArmQuery(a, vectorStr, filters)));
  const arms = rowLists.map((rows, i) => ({
    items: rows.map(mapToResearchDoc),
    weight: armWeight(aliases[i].matches),
  }));
  return { aliases, arms };
}

/**
 * Batched post-fusion snippet extraction (#702 perf): headlines run only for
 * the keyword-surfaced docs that made the final list, not every arm candidate.
 */
async function attachMatchSnippets(docs: ResearchDocument[]): Promise<ResearchDocument[]> {
  const pending = docs.filter((d) => d.matchedAlias && !d.matchSnippet);
  if (pending.length === 0) return docs;
  const snippets = await fetchMatchSnippets(
    pending.map((d) => ({ id: d.id, phrase: d.matchedAlias as string })),
  );
  for (const d of pending) {
    const snippet = snippets.get(d.id);
    if (snippet) d.matchSnippet = snippet;
  }
  return docs;
}

/** Restrict fusion arms to one tier (order-preserving) for the tiered pools. */
function armsForTier(
  arms: FusionArm<ResearchDocument>[],
  tier: DocumentTier,
): FusionArm<ResearchDocument>[] {
  return arms.map((a) => ({ items: a.items.filter((d) => d.tier === tier), weight: a.weight }));
}

export async function searchResearch(
  query: string,
  topK = 30,
  precomputedEmbedding?: number[],
  dateFrom?: string,
  dateTo?: string,
  tierFilter: ResearchTierFilter = 'all',
): Promise<ResearchDocument[]> {
  if (!isDbAvailable()) return [];
  const embedding = precomputedEmbedding ?? (await embedText(query));
  if (!embedding) return [];

  const db = getDb();
  const vectorStr = `[${embedding.join(',')}]`;

  try {
    if (tierFilter !== 'all') {
      const [results, { arms }] = await Promise.all([
        executeFilteredVectorQuery(
          db,
          buildResearchQuery(vectorStr, query, { topK, dateFrom, dateTo, tier: tierFilter }),
        ),
        runResearchAliasArms(query, vectorStr, dateFrom, dateTo, tierFilter),
      ]);
      const primary = (results.rows as Record<string, unknown>[]).map(mapToResearchDoc);
      // Fuse to 2x then URL-dedupe (alias arms reintroduce same-url rows the
      // primary arm's DISTINCT ON (url) had collapsed) and refill to topK.
      const fused = dedupeByUrl(fuseWeightedRrf(primary, arms, topK * 2)).slice(0, topK);
      return attachMatchSnippets(fused);
    }
    return await attachMatchSnippets(
      await searchResearchAllTiers(db, query, vectorStr, topK, dateFrom, dateTo),
    );
  } catch (err) {
    // #598: throw, never return [] — see searchExplore's catch for rationale.
    console.error('[search] Research search failed:', err);
    throw err;
  }
}

/**
 * Per-tier candidate pools: primary sources must not be crowded out of a
 * shared pool by debate-style text that embeds closer to question phrasing.
 * Alias arms run once tier-unfiltered, then split by tier so each pool fuses
 * only with its own tier's keyword hits (#702).
 */
async function searchResearchAllTiers(
  db: ReturnType<typeof getDb>,
  query: string,
  vectorStr: string,
  topK: number,
  dateFrom?: string,
  dateTo?: string,
): Promise<ResearchDocument[]> {
  const [actionRows, discussionRows, { arms }] = await Promise.all([
    executeFilteredVectorQuery(
      db,
      buildResearchQuery(vectorStr, query, { topK, dateFrom, dateTo, tier: 'action' }),
    ),
    executeFilteredVectorQuery(
      db,
      buildResearchQuery(vectorStr, query, { topK, dateFrom, dateTo, tier: 'discussion' }),
    ),
    runResearchAliasArms(query, vectorStr, dateFrom, dateTo),
  ]);
  const fusePool = (rows: Record<string, unknown>[], tier: DocumentTier) =>
    dedupeByUrl(
      fuseWeightedRrf(rows.map(mapToResearchDoc), armsForTier(arms, tier), topK * 2),
    ).slice(0, topK);
  return composeTieredResults(
    fusePool(actionRows.rows as Record<string, unknown>[], 'action'),
    fusePool(discussionRows.rows as Record<string, unknown>[], 'discussion'),
    topK,
  );
}

/** Fetch research documents by id, preserving input order (#552). */
export async function fetchResearchDocsByIds(ids: number[]): Promise<ResearchDocument[]> {
  const rows = await fetchResearchDocRowsByIds(ids);
  return rows.map(mapToResearchDoc);
}

function mapToResearchDoc(row: Record<string, unknown>): ResearchDocument {
  return {
    id: Number(row.id),
    title: row.title as string,
    content: row.content as string | null,
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
          AND d.retrieval_relevant IS NOT FALSE
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
