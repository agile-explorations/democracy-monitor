/** Institutional function buckets for document classification. */
export type FunctionalBucket =
  | 'rulemaking'
  | 'executive_action'
  | 'personnel_action'
  | 'administrative_procedure'
  | 'organizational_change'
  | 'financial_regulatory'
  | 'cultural_ceremonial'
  | 'news_rhetoric'
  | 'enforcement_action'
  | 'judicial_action'
  | 'unclassified';

/** Score for a single structural dimension (volume, type composition, etc.). */
export interface DimensionScore {
  value: number;
  baselineMean: number;
  baselineStdDev: number;
  zScore: number;
  /** Whether this dimension was available for scoring. */
  available: boolean;
}

/** A significant shift in a functional distribution bucket. */
export interface FunctionalShift {
  bucket: FunctionalBucket;
  baselineRate: number;
  currentRate: number;
  direction: 'increased' | 'decreased' | 'absent';
}

/** Composite structural anomaly score for a category-week. */
export interface StructuralScore {
  composite: number;
  dimensions: {
    volume: DimensionScore;
    typeComposition: DimensionScore;
    functionalDistribution: DimensionScore;
    agencyActivity: DimensionScore;
    publicationTempo: DimensionScore;
    sourceConvergence?: DimensionScore;
  };
  anomalous: boolean;
  functionalShifts: FunctionalShift[];
  longHorizon: {
    cumulativeDeviation: number;
    cumulativeWindow: number;
    driftTrend: 'stable' | 'increasing' | 'decreasing';
  };
}

/** Thematic drift score from embedding-based analysis. */
export interface ThematicDriftScore {
  rollingCentroidDistance: number;
  rollingWindow: {
    weeks: number;
    meanDistance: number;
    stdDev: number;
  };
  zScore: number;
  novelDocumentRate: number;
  varianceRatio: number;
  crossAdminDistance: number | null;
  crossAdminBaseline: string | null;
  bootstrap: boolean;
}

/** Erosion concern level. Divergent retained for legacy DB records but no longer produced. */
export type ConcernLevel = 'Stable' | 'Elevated' | 'Divergent' | 'ConfirmedConcern';

/** Result of erosion concern assessment for a category-week. */
export interface ConcernAssessment {
  status: ConcernLevel;
  /** Structural anomaly — descriptive context, does not drive concern level */
  structuralElevated: boolean;
  /** AI document review — sole detection mechanism driving concern level */
  aiElevated: boolean;
  /** Silence detection — descriptive context (source health indicator) */
  silenceElevated: boolean;
  /** Thematic drift — descriptive context, does not drive concern level */
  thematicElevated: boolean;
  /** @deprecated Always 0 or 1. Retained for serialized DB JSON compatibility. */
  layersElevated: number;
  pattern: string;
  bootstrap: boolean;
}

/** Summary of AI document review results for a category-week. */
export interface AIAssessmentSummary {
  flagCount: number;
  totalDocuments: number;
  flagRate: number;
  baselineFlagRate: number;
  flagRateZScore: number;
  concernDistribution: {
    routine: number;
    novelNotConcerning: number;
    potentiallyConcerning: number;
    clearlyConcerning: number;
  };
  concernRate: number;
  auditSample: {
    sampled: number;
    falseNegatives: number;
    falseNegativeRate: number;
  };
  pass1Model: string;
  pass2Model: string;
}

/** Metadata extracted from documents for structural analysis. */
export interface WeekMetadata {
  category: string;
  weekOf: string;
  documentCount: number;
  typeDistribution: Record<string, number>;
  functionalDistribution: Record<FunctionalBucket, number>;
  agencyDistribution: Record<string, number>;
  dailyCounts: number[];
  sourceConvergenceRatio?: number;
}

/** Baseline structural distributions for a category. */
export interface BaselineDistribution {
  baselineId: string;
  category: string;
  meanDocCount: number;
  stdDevDocCount: number;
  typeDistribution: Record<string, number>;
  functionalDistribution: Record<FunctionalBucket, number>;
  agencyDistribution: Record<string, number>;
  meanDailyVariance: number;
  stdDevDailyVariance: number;
  meanSourceConvergenceRatio?: number;
  stdDevSourceConvergenceRatio?: number;
}
