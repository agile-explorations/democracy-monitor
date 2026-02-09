/** Severity tier for keyword matches. */
export type SeverityTier = 'capture' | 'drift' | 'warning';

/** Document classification derived from Federal Register type or source heuristics. */
export type DocumentClass =
  | 'executive_order'
  | 'presidential_memorandum'
  | 'final_rule'
  | 'proposed_rule'
  | 'notice'
  | 'court_opinion'
  | 'report'
  | 'press_release'
  | 'unknown';

/** A single keyword match with context. */
export interface KeywordMatch {
  keyword: string;
  tier: SeverityTier;
  weight: number;
  /** ~100 chars of surrounding text where the match was found. */
  context: string;
}

/** A keyword match that was suppressed by a rule. */
export interface SuppressedMatch {
  keyword: string;
  tier: SeverityTier;
  rule: string;
  reason: string;
}

/** Per-document scoring result with full audit trail. */
export interface DocumentScore {
  /** URL of the scored document (primary dedup key). */
  url: string;
  /** Database document ID, if available. */
  documentId?: number;
  /** Category the document was scored against. */
  category: string;
  /** Raw severity score before class multiplier. */
  severityScore: number;
  /** Final score after class multiplier. */
  finalScore: number;
  /** Keyword match counts by tier. */
  captureCount: number;
  driftCount: number;
  warningCount: number;
  suppressedCount: number;
  /** Classified document type. */
  documentClass: DocumentClass;
  /** Multiplier applied based on document class. */
  classMultiplier: number;
  /** Whether the source is a high-authority agency. */
  isHighAuthority: boolean;
  /** All keyword matches found in this document. */
  matches: KeywordMatch[];
  /** All keyword matches that were suppressed. */
  suppressed: SuppressedMatch[];
  /** When the document was scored. */
  scoredAt: string;
  /** ISO date string for the week bucket (Monday of the week). */
  weekOf: string;
  /** Document title for display. */
  title: string;
  /** Original publication date, if known. */
  publishedAt?: string;
}
