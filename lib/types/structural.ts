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
  };
  anomalous: boolean;
  functionalShifts: FunctionalShift[];
  longHorizon: {
    cumulativeDeviation: number;
    cumulativeWindow: number;
    driftTrend: 'stable' | 'increasing' | 'decreasing';
  };
}

/** A shift in a thematic cluster's proportion. */
export interface ClusterShift {
  clusterId: string;
  label: string;
  rollingPercentage: number;
  currentPercentage: number;
  shift: number;
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
export type ConvergenceStatus = 'Stable' | 'Elevated' | 'Divergent';

/** Result of combining L1 + L3 (partial — L2 deferred to Sprint R3). */
export interface ConvergenceSynthesis {
  status: ConvergenceStatus;
  structuralElevated: boolean;
  thematicElevated: boolean;
  layersElevated: number;
  pattern: string;
  bootstrap: boolean;
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
}
