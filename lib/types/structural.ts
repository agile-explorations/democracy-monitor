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
  /**
   * Full silence-detection detail (#546) — persists mode (zscore | sparse),
   * presence rate, zero streak, and the sparse-coverage note alongside the
   * silenceElevated boolean so narratives and the UI can explain HOW silence
   * was assessed for sparse categories.
   */
  silence?: SilenceDetail;
}

/** Serialized subset of SilenceScore stored inside convergence_detail (#546). */
export interface SilenceDetail {
  mode: 'zscore' | 'sparse';
  govDocCount: number;
  independentDocCount: number;
  rollingGovMean: number;
  govSilenceZ: number;
  presenceRate?: number;
  zeroStreak?: number;
  coverageNote?: string;
}

/**
 * Institutional actors that can perform an erosion-relevant action (#537).
 * The actor is WHO performs the action — never the document's author or venue.
 * Single source of truth: the zod enum, P2 prompt framework, UI label maps,
 * and actorConfirmations keys all derive from this list.
 */
export const EROSION_ACTORS = [
  'federal_executive',
  'congress',
  'judiciary',
  'state_local',
  'other_unclear',
] as const;

export type ErosionActor = (typeof EROSION_ACTORS)[number];

/**
 * Per-actor confirmed-assessment counts. 'unattributed' captures P2 rows
 * without an erosion_actor value (pre-attribution assessments) so coverage
 * gaps stay visible instead of blending into other_unclear.
 */
export type ActorConfirmations = Record<
  ErosionActor | 'unattributed',
  { potentiallyConcerning: number; clearlyConcerning: number }
>;

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
  /**
   * Per-actor breakdown of the concerning counts (#537). Optional: aggregates
   * enriched before actor attribution lack it — consumers must guard.
   * Deliberately NOT read by concern synthesis (status stays all-actors;
   * headline framing decision deferred — see issue #537).
   */
  actorConfirmations?: ActorConfirmations;
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
  /**
   * Empirical JSD baseline statistics (#573): mean/std of each baseline
   * week's divergence from the baseline aggregate distribution. Small-sample
   * weeks always diverge from the aggregate, so these run well above zero —
   * the earlier hardcoded mean 0 / std 0.05 assumption saturated the z-scores
   * (agency z ≈ +11 every week). Absent on legacy captures; scoring falls
   * back to the documented constants.
   */
  jsdStats?: {
    type: JsdStat;
    functional: JsdStat;
    agency: JsdStat;
  };
}

/** Mean/std of weekly JSD values across a baseline period. */
export interface JsdStat {
  mean: number;
  std: number;
}
