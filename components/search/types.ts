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
  /** Corpus-validated alias terms the hybrid arms searched (#702). */
  alsoSearched?: string[];
  /** Deterministic quote verification vs stored document content (#707). */
  quoteVerification?: {
    /** Verification could not run (DB error) — rendered distinctly so a
     *  broken verifier is never mistaken for a quote-free answer (#725). */
    unavailable?: boolean;
    /** Wall-clock cost of the verification pass (#726) — debug capture only. */
    verificationMs?: number;
    totalQuotes: number;
    verifiedCount: number;
    /** Citation brackets the verifier rewrote in the displayed answer (#720):
     *  'replaced' = unique verbatim source supplanted the original;
     *  'expanded' = union of original + verbatim sources. */
    corrections?: Array<{
      quote: string;
      from: number[];
      to: number[];
      kind: 'replaced' | 'expanded';
    }>;
    unverified: Array<{
      quote: string;
      citations: number[];
      /** Context doc that DOES contain the quote verbatim — mis-citation,
       *  not fabrication (#718). */
      foundIn?: number;
      /** 2+ non-cited docs contain the quote — term-of-art note (#720). */
      ambiguousIn?: number[];
      /** Identical quote + citation flagged this many times in the answer. */
      count?: number;
      nearest?: { citation: number; text: string };
    }>;
  } | null;
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
  /** P2 review reasoning excerpt (optional: cached payloads may predate it). */
  p2Summary?: string | null;
  /** P2 verdict/mechanism/confidence (optional: cached payloads may predate them). */
  p2Assessment?: string | null;
  p2ErosionType?: string | null;
  p2Confidence?: number | null;
  /** Matched-passage excerpt (#702) — present when a keyword arm surfaced this doc. */
  matchSnippet?: string | null;
  /** The corpus-validated alias whose arm surfaced this doc (#702). */
  matchedAlias?: string | null;
}

export interface ExploreResult {
  totalResults: number;
  page: number;
  pageSize: number;
  documents: ExploreDocResult[];
  /** Corpus-validated alias terms the hybrid arms searched (#702). */
  alsoSearched?: string[];
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
  /** Matched-passage excerpt (#702) — present when a keyword arm surfaced this doc. */
  matchSnippet?: string | null;
  /** The corpus-validated alias whose arm surfaced this doc (#702). */
  matchedAlias?: string | null;
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
  /** P2 review reasoning — the "what this document is about" line (optional: cached payloads may predate it). */
  aiReasoning?: string | null;
}
