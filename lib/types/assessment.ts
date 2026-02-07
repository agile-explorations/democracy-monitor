import type { StatusLevel } from './categories';

export interface AssessmentDetail {
  captureCount: number;
  driftCount: number;
  warningCount: number;
  itemsReviewed: number;
  hasAuthoritative: boolean;
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
