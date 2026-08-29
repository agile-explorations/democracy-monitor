/**
 * Search-surface type definitions (Explore + Research modes), relocated from
 * search-service.ts (#750 file-size split). Behavior-free.
 */

import type { DocumentTier } from '@/lib/data/document-tiers';

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
  /** How the doc entered the pool (#800): the vector/fusion seed sweep or a
   *  guaranteed arm slot. Lets instruments tell arm docs apart now that
   *  both carry a real cosine. */
  provenance?: 'seed' | 'arm';
  /** Query-matched verbatim excerpt for synthesis grounding (#707). */
  queryExcerpt?: string;
  /** Ruling-language excerpt for judicial opinions (#707). */
  dispositionExcerpt?: string;
}

export interface SimilarDocumentResult {
  sameCategory: SearchResultDocument[];
  otherCategories: SearchResultDocument[];
}
