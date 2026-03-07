import type { DocumentClass, SeverityTier } from '@/lib/types/scoring';

/** Per-tier weights applied to keyword match counts. */
export const TIER_WEIGHTS: Record<SeverityTier, number> = {
  capture: 4,
  drift: 2,
  warning: 1,
};

/**
 * Multiplier applied based on document classification.
 * Executive orders and final rules carry more weight than notices.
 */
export const CLASS_MULTIPLIERS: Record<DocumentClass, number> = {
  executive_order: 1.5,
  presidential_memorandum: 1.4,
  proclamation: 1.3,
  presidential_notice: 1.5,
  final_rule: 1.3,
  proposed_rule: 1.0,
  notice: 0.5,
  court_opinion: 1.3,
  report: 1.2,
  press_release: 0.7,
  unknown: 1.0,
};

/**
 * Compute severity score with logarithmic diminishing returns for capture-tier matches.
 *
 * Formula:
 *   captureScore = TIER_WEIGHTS.capture × log2(captureCount + 1)
 *   driftScore   = driftCount × TIER_WEIGHTS.drift
 *   warningScore = warningCount × TIER_WEIGHTS.warning
 *
 * Examples: 1 capture → 4.0, 2 → 6.34, 3 → 8.0, 4 → 9.29
 */
export function computeSeverityScore(
  captureCount: number,
  driftCount: number,
  warningCount: number,
): number {
  const captureScore = TIER_WEIGHTS.capture * Math.log2(captureCount + 1);
  const driftScore = driftCount * TIER_WEIGHTS.drift;
  const warningScore = warningCount * TIER_WEIGHTS.warning;
  return captureScore + driftScore + warningScore;
}

/** Number of weeks for the exponential decay half-life in cumulative scoring. */
export const DECAY_HALF_LIFE_WEEKS = 8;

/** Semantic drift at or above this multiple of the noise floor is considered elevated. */
export const SEMANTIC_DRIFT_ELEVATED_THRESHOLD = 1.0;

/** Semantic drift above this multiple of the noise floor is flagged as anomalous. */
export const SEMANTIC_DRIFT_ANOMALY_THRESHOLD = 2.0;

/** Convergence score at or above this value (with 2+ active themes) indicates entrenched infrastructure. */
export const CONVERGENCE_ENTRENCHED_THRESHOLD = 50;

/** Data coverage factor weights (must sum to 1.0). */
export const DATA_COVERAGE_WEIGHTS = {
  sourceDiversity: 0.13,
  authorityWeight: 0.22,
  evidenceCoverage: 0.17,
  keywordDensity: 0.13,
  aiAgreement: 0.2,
  sourceAvailability: 0.15,
} as const;

/** Source health classification thresholds. */
export const HEALTH_THRESHOLDS = {
  /** <50% of expected volume = degraded. */
  degradedVolumeRatio: 0.5,
  /** 2 consecutive zero-document checks = silent. */
  silentCheckCount: 2,
  /** >50% of sources unavailable = critical overall health. */
  criticalSourceFraction: 0.5,
  /** >25% of sources unavailable or degraded = degraded overall health. */
  degradedSourceFraction: 0.25,
} as const;

/** Max confidence when source health is critical. */
export const CRITICAL_CONFIDENCE_CAP = 0.3;

/** Data integrity classification thresholds. */
export const INTEGRITY_THRESHOLDS = {
  /** Integrity score >= this → high. */
  high: 0.8,
  /** Integrity score >= this → moderate. */
  moderate: 0.5,
  /** Integrity score >= this → low (below = critical). */
  low: 0.25,
} as const;

/** Fraction of canary sources that must be down to trigger critical_silent. */
export const CANARY_CRITICAL_FRACTION = 0.5;

/** Maximum distinct sources before diversity score saturates at 1.0. */
export const SOURCE_DIVERSITY_MAX = 6;

/** Maximum authoritative source count before authority score saturates at 1.0. */
export const AUTHORITY_COUNT_MAX = 3;

/** Maximum evidence item count before coverage score saturates at 1.0. */
export const EVIDENCE_COUNT_MAX = 10;

/** Keyword density ratio: matches / (items × ratio) caps the density score. */
export const KEYWORD_DENSITY_RATIO = 0.3;

/** Baseline ID for the primary "normal governance" reference period. */
export const PRIMARY_BASELINE_ID = 'biden_2022';

/** The cycle year of the primary baseline (Biden 2022 = Year 2). */
export const PRIMARY_BASELINE_CYCLE_YEAR = 2;

/** Month (0-indexed) and day of the term start anniversary. */
const TERM_START_MONTH = 0; // January
const TERM_START_DAY = 20;
const TERM_START_YEAR = 2025;

/**
 * Determine which year (1–4) of the presidential term a given date falls in.
 * Jan 20 2025 = Year 1, Jan 20 2026 = Year 2, etc. Clamped to 1–4.
 * Uses UTC to avoid timezone edge cases when dates are parsed from ISO strings.
 */
export function getCurrentCycleYear(date?: Date): number {
  const d = date ?? new Date();
  let year = d.getUTCFullYear() - TERM_START_YEAR + 1;
  if (
    d.getUTCMonth() < TERM_START_MONTH ||
    (d.getUTCMonth() === TERM_START_MONTH && d.getUTCDate() < TERM_START_DAY)
  ) {
    year--;
  }
  return Math.max(1, Math.min(4, year));
}

// --- Structural anomaly (Layer 1) ---

/** Dimension weights for the composite structural score. Must sum to 1.0. */
export const STRUCTURAL_DIMENSION_WEIGHTS = {
  volume: 0.22,
  typeComposition: 0.18,
  functionalDistribution: 0.22,
  agencyActivity: 0.13,
  publicationTempo: 0.12,
  sourceConvergence: 0.13,
} as const;

/** Composite structural score above this threshold is considered anomalous. */
export const STRUCTURAL_ANOMALY_THRESHOLD = 2.5;

/** Minimum documents in a category-week for full structural score weight. Below this, dampen. */
export const STRUCTURAL_MIN_DOC_COUNT = 10;

/** Expected JSD baseline mean (identical distributions produce JSD = 0). */
export const JSD_BASELINE_MEAN = 0;

/** Expected JSD baseline standard deviation for normal week-to-week variation. */
export const JSD_BASELINE_STDDEV = 0.05;

/** Z-score above this for any individual dimension is considered elevated. */
export const STRUCTURAL_DIMENSION_ELEVATED = 1.5;

/** Number of trailing weeks for long-horizon cumulative deviation. */
export const LONG_HORIZON_WINDOW_WEEKS = 12;

/** Minimum half-difference between first/second half of window to classify drift trend. */
export const DRIFT_TREND_THRESHOLD = 0.3;

/** Minimum functional distribution shift (percentage points) to report. */
export const FUNCTIONAL_SHIFT_THRESHOLD = 0.03;

// --- Thematic drift (Layer 3) ---

/** Number of weeks in the rolling window for intra-admin comparison. */
export const THEMATIC_ROLLING_WINDOW_WEEKS = 8;

/** Z-score above this for thematic drift is considered elevated. */
export const THEMATIC_DRIFT_ELEVATED = 3.5;

/** Confidence multiplier during bootstrap period (first N weeks). */
export const BOOTSTRAP_CONFIDENCE = 0.5;

// --- Layer 2 (AI two-pass assessment) ---

/** Z-score threshold for AI flag rate to be considered elevated (requires P2 corroboration). */
export const AI_FLAG_RATE_THRESHOLD = 1.5;

/** Z-score threshold for AI flag rate to fire without P2 corroboration (very strong signal). */
export const AI_FLAG_RATE_STRONG_THRESHOLD = 3.0;

/** Fraction of Pass 2 docs at potentially/clearly concerning to trigger high concern. */
export const AI_CONCERN_THRESHOLD = 0.2;

/** Minimum non-audit Pass 2 assessments required for concern rate to be meaningful. */
export const AI_CONCERN_MIN_SAMPLE = 3;

/** Minimum total documents required for AI flag rate z-score to trigger elevation. */
export const AI_FLAG_RATE_MIN_DOCS = 10;

/** Default fraction of unflagged docs to audit with Pass 2. */
export const AUDIT_SAMPLE_RATE = 0.03;

/** Characters before a keyword to scan for negation patterns. */
export const NEGATION_WINDOW_BEFORE = 200;

/** Characters after a keyword to scan for negation patterns. */
export const NEGATION_WINDOW_AFTER = 50;
