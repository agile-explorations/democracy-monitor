/**
 * Research response formatting helpers for /api/search (#702 relocation —
 * pages/api files cannot host non-route helper modules without becoming
 * routes, and the route file was over the max-lines budget).
 */

import { createHash } from 'crypto';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import { computeDateRange } from '@/lib/services/research-prompts';
import type { ResearchSynthesisResult } from '@/lib/services/research-synthesis-service';
import type { CorpusStats } from '@/lib/services/search-research-queries';
import type { RetrievalStratum } from '@/lib/services/search-response-types';
import type { ResearchDocument } from '@/lib/services/search-service';

export interface CachedResearchResult {
  synthesis: ResearchSynthesisResult;
  documents: ResearchDocument[];
  queryConfidence: number;
  corpusStats?: CorpusStats | null;
}

export function emptyAnswer() {
  return {
    expert:
      'The documentary record in our corpus does not contain enough information to answer this question. ' +
      'This may mean the topic is not reflected in Federal Register publications, court filings, or other ' +
      'government documents in our collection, or that relevant documents fall outside our current date range.',
    public:
      'We could not find enough government documents to answer this question. The topic may not be covered ' +
      'in the documents we monitor, or relevant documents may fall outside the dates we have on record.',
  };
}

export function emptyResearchResponse(docsOnly: boolean) {
  return {
    documents: [],
    dateRange: { earliest: 'unknown', latest: 'unknown' },
    queryConfidence: 0,
    ...(docsOnly ? {} : { answer: emptyAnswer(), relatedQuestions: [] }),
  };
}

export function formatDocList(docs: ResearchDocument[]) {
  return docs.map((doc, i) => ({
    citationIndex: i + 1,
    id: doc.id,
    tier: doc.tier,
    title: doc.title,
    url: doc.url,
    publishedAt: doc.publishedAt,
    sourceType: doc.sourceType,
    sourceOrigin: doc.sourceOrigin,
    caseId: doc.caseId ?? null,
    category: doc.category,
    cosineSimilarity: doc.cosineSimilarity,
    finalScore: doc.finalScore,
    documentClass: doc.documentClass,
    p2Assessment: doc.p2Assessment,
    p2ErosionType: doc.p2ErosionType,
    p2Summary: doc.p2Summary,
    ...(doc.matchSnippet ? { matchSnippet: doc.matchSnippet } : {}),
    ...(doc.matchedAlias ? { matchedAlias: doc.matchedAlias } : {}),
  }));
}

export function formatResearchResponse(
  result: CachedResearchResult,
  allDocs: ResearchDocument[],
  editorial: boolean,
  searchedTerms: ValidatedAlias[] = [],
) {
  const { synthesis, queryConfidence, corpusStats: stats } = result;
  const dateRange = computeDateRange(allDocs);

  const response: Record<string, unknown> = {
    answer: { expert: synthesis.expert, public: synthesis.public },
    documents: formatDocList(allDocs),
    dateRange,
    queryConfidence,
    relatedQuestions: synthesis.relatedQuestions,
    ...(stats ? { corpusStats: stats } : {}),
    // alsoSearched (bare phrases) is the UI-chip field; searchedTerms adds
    // corpus match counts for synthesis transparency (#713).
    ...(searchedTerms.length > 0
      ? { alsoSearched: searchedTerms.map((t) => t.phrase), searchedTerms }
      : {}),
  };

  if (editorial) {
    response.editorial = {
      expertDraft: synthesis.expertDraft,
      publicDraft: synthesis.publicDraft,
      feedback: synthesis.feedback,
      draftModel: synthesis.draftModel,
      feedbackModel: synthesis.feedbackModel,
      finalModel: synthesis.finalModel,
    };
  }

  return response;
}

/** docsOnly cache key material: query + every retrieval-affecting parameter. */
export function hashDocsKey(
  query: string,
  params: { dateFrom?: string; dateTo?: string; tier?: string; eras?: string },
): string {
  const material = [
    query.toLowerCase().trim(),
    params.dateFrom ?? '',
    params.dateTo ?? '',
    params.tier ?? '',
    params.eras ?? '',
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

/** Assemble the docsOnly response payload (also the cached shape, #705). */
export function buildDocsOnlyPayload(
  allDocs: ResearchDocument[],
  avgSimilarity: number,
  strata: RetrievalStratum[] | null,
  inferredFrom: string | null,
  searchedTerms: ValidatedAlias[],
  docsKey?: string,
): Record<string, unknown> {
  return {
    ...(docsKey ? { docsKey } : {}),
    documents: formatDocList(allDocs),
    dateRange: computeDateRange(allDocs),
    queryConfidence: avgSimilarity,
    ...(strata ? { strata } : {}),
    ...(inferredFrom ? { inferredDateFrom: inferredFrom } : {}),
    ...(searchedTerms.length > 0
      ? { alsoSearched: searchedTerms.map((t) => t.phrase), searchedTerms }
      : {}),
  };
}
