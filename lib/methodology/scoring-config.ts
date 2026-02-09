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
