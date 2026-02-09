import type { DocumentClass, KeywordMatch, SeverityTier, SuppressedMatch } from './scoring';

/** Breakdown of keyword matches by severity tier. */
export interface TierBreakdown {
  tier: SeverityTier;
  count: number;
  weight: number;
  contribution: number;
}

/** Explanation of how a single document was scored. */
export interface DocumentExplanation {
  url: string;
  title: string;
  documentClass: DocumentClass;
  classMultiplier: number;
  severityScore: number;
  finalScore: number;
  formula: string;
  tierBreakdown: TierBreakdown[];
  matches: KeywordMatch[];
  suppressed: SuppressedMatch[];
}

/** Snapshot of the scoring configuration used at explanation time. */
export interface ConfigSnapshot {
  tierWeights: Record<SeverityTier, number>;
  classMultipliers: Record<DocumentClass, number>;
  dataCoverageWeights: Record<string, number>;
  decayHalfLifeWeeks: number;
  negationWindowBefore: number;
  negationWindowAfter: number;
  sourceDiversityMax: number;
  authorityCountMax: number;
  evidenceCountMax: number;
  keywordDensityRatio: number;
}

/** Explanation of a week's aggregate score for a category. */
export interface WeekExplanation {
  category: string;
  weekOf: string;
  totalSeverity: number;
  documentCount: number;
  avgSeverityPerDoc: number;
  tierProportions: {
    capture: number;
    drift: number;
    warning: number;
  };
  topDocuments: DocumentExplanation[];
  topKeywords: string[];
  configSnapshot: ConfigSnapshot;
}
