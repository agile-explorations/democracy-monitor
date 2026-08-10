export type SearchMode = 'research' | 'explore';

export interface ResearchResult {
  answer: { expert: string; public: string };
  documents: ResearchDocResult[];
  dateRange: { earliest: string; latest: string };
  queryConfidence: number;
  relatedQuestions: string[];
  corpusStats?: { totalMatching: number } | null;
  /** Present for comparative questions: the era windows retrieval was
   *  stratified across (#592). */
  strata?: Array<{
    key: string;
    label: string;
    from: string;
    to?: string;
    docCount: number;
    dateConflict?: boolean;
  }> | null;
  /** Date floor inferred from range phrasing in the question (#594). */
  inferredDateFrom?: string | null;
  editorial?: {
    expertDraft: string;
    publicDraft: string;
    feedback: string;
    draftModel: string;
    feedbackModel: string;
    finalModel: string;
  };
}

export interface ResearchDocResult {
  citationIndex: number;
  id: number;
  title: string;
  url: string | null;
  publishedAt: string | null;
  sourceType: string;
  tier?: 'action' | 'discussion';
  sourceOrigin: string | null;
  caseId?: string | null;
  category: string;
  cosineSimilarity: number;
  finalScore: number | null;
  documentClass: string | null;
}

export interface ExploreResult {
  totalResults: number;
  page: number;
  pageSize: number;
  documents: ExploreDocResult[];
}

export interface ExploreDocResult {
  id: number;
  title: string;
  url: string | null;
  publishedAt: string | null;
  sourceType: string;
  sourceOrigin: string | null;
  caseId?: string | null;
  category: string;
  snippet: string | null;
  cosineSimilarity: number | null;
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
}
