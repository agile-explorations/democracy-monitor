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
