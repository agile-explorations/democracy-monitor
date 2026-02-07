import type { StatusLevel } from './categories';

/** Shape of items passed to the assessment layer (superset of FeedItem) */
export interface ContentItem {
  title?: string;
  summary?: string;
  link?: string;
  pubDate?: string;
  agency?: string;
  date?: string;
  note?: string;
  type?: string;
  isError?: boolean;
  isWarning?: boolean;
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
  oversightGovDown?: string;
}

export type AssessmentRules = Record<string, AssessmentRule>;
