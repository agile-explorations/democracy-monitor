import type { StatusLevel } from './categories';

/** Shape of items passed to the assessment layer (superset of FeedItem) */
export interface ContentItem {
  title?: string;
  content?: string;
  link?: string;
  pubDate?: string;
  agency?: string;
  date?: string;
  note?: string;
  type?: string;
  subtype?: string;
  action?: string;
  sourceOrigin?: string;
  caseId?: string;
  isError?: boolean;
  isWarning?: boolean;
  /**
   * Storage content classification. Set 'metadata_only' when the source can
   * only provide listing/detail metadata (no retrievable body) so the document
   * is excluded from scoring/assessment eligibility at ingest instead of being
   * mislabeled full_text with stub content (the #645 LegiScan defect).
   */
  contentType?: 'full_text' | 'metadata_only';
  /**
   * Persisted counting-scope, threaded when an item is rebuilt from a stored
   * row. When present it is authoritative: it was computed at ingest from the
   * FULL content, whereas a re-classification of the sweep's truncated copy can
   * flip an in-scope opinion to out-of-scope and skip its score row (#667).
   * Undefined on freshly-fetched items → classify from full content.
   */
  countingScope?: boolean | null;
  /**
   * Raw stored content length, threaded when an item is rebuilt from a stored
   * row whose content was boilerplate-stripped or sliced for assessment. The
   * scorer's eligibility floor must agree with the SQL floor G1a and the
   * scores backfill apply to RAW content (#667): a document that is eligible
   * by SQL but skipped by the scorer holds the digest.
   */
  contentLength?: number;
  /** Extra metadata to store alongside the document (merged with auto-extracted fields). */
  metadata?: Record<string, unknown>;
}

export interface AssessmentDetail {
  captureCount: number;
  driftCount: number;
  warningCount: number;
  itemsReviewed: number;
  hasAuthoritative: boolean;
  insufficientData?: boolean;
}

export interface AssessmentResult {
  status: StatusLevel;
  reason: string;
  matches: string[];
  detail?: AssessmentDetail;
}

export interface AssessmentRule {
  keywords: {
    capture: string[];
    drift: string[];
    warning: string[];
  };
  volumeThreshold?: {
    warning: number;
    drift: number;
    capture: number;
  };
}

export type AssessmentRules = Record<string, AssessmentRule>;
