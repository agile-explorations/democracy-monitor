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

/** Convergence synthesis status levels. */
export type ConvergenceStatus = 'Stable' | 'Elevated' | 'Divergent' | 'ConfirmedConcern';

/** Result of L2 AI assessment synthesis. */
export interface ConvergenceSynthesis {
  status: ConvergenceStatus;
  /** L1 structural anomaly — descriptive only, does not influence convergence status */
  structuralElevated: boolean;
  /** L2 AI content assessment — sole active detection layer driving convergence status */
  aiElevated: boolean;
  /** L1v2 silence detection — descriptive only (source health indicator) */
  silenceElevated: boolean;
  /** L3 thematic drift — descriptive only, does not influence convergence status */
  thematicElevated: boolean;
  layersElevated: number;
  pattern: string;
  bootstrap: boolean;
}

/** Summary of Layer 2 AI assessment results for a category-week. */
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
