import type { StatusLevel } from '@/lib/types';

const STATUS_ORDER: StatusLevel[] = ['Stable', 'Warning', 'Drift', 'Capture'];

export interface DowngradeDecision {
  finalStatus: StatusLevel;
  downgradeApplied: boolean;
  flaggedForReview: boolean;
  reason: string;
}

/** Returns 0–3 numeric index for a StatusLevel (Stable=0, Capture=3). */
export function statusIndex(status: StatusLevel): number {
  return STATUS_ORDER.indexOf(status);
}

/** Absolute distance between two status levels (0–3). */
export function statusDistance(a: StatusLevel, b: StatusLevel): number {
  return Math.abs(statusIndex(a) - statusIndex(b));
}

/** True if `recommended` is strictly lower severity than `ceiling`. */
export function isDowngrade(ceiling: StatusLevel, recommended: StatusLevel): boolean {
  return statusIndex(recommended) < statusIndex(ceiling);
}

/** Clamps `recommended` to be at most `ceiling`. */
export function clampToCeiling(ceiling: StatusLevel, recommended: StatusLevel): StatusLevel {
  return statusIndex(recommended) > statusIndex(ceiling) ? ceiling : recommended;
}

/**
 * Determines whether to accept an AI downgrade, flag for review, or keep keyword status.
 *
 * Rules:
 * - Same status → no downgrade, no flag
 * - 1-level down + confidence ≥ 0.7 → auto-accept AI's level
 * - 2+ levels down OR confidence < 0.7 → flag for review, keep keyword level
 */
export function resolveDowngrade(
  keywordStatus: StatusLevel,
  aiRecommended: StatusLevel,
  aiConfidence: number,
): DowngradeDecision {
  // Clamp first — AI cannot recommend higher than keyword
  const clamped = clampToCeiling(keywordStatus, aiRecommended);
  const distance = statusDistance(keywordStatus, clamped);

  if (distance === 0) {
    return {
      finalStatus: keywordStatus,
      downgradeApplied: false,
      flaggedForReview: false,
      reason: `AI agrees with keyword assessment: ${keywordStatus}`,
    };
  }

  if (distance === 1 && aiConfidence >= 0.7) {
    return {
      finalStatus: clamped,
      downgradeApplied: true,
      flaggedForReview: false,
      reason: `AI recommends ${clamped} (1 level down, confidence ${aiConfidence.toFixed(2)}): auto-accepted`,
    };
  }

  // 2+ levels down OR low confidence → flag for review, keep keyword
  return {
    finalStatus: keywordStatus,
    downgradeApplied: false,
    flaggedForReview: true,
    reason:
      distance >= 2
        ? `AI recommends ${clamped} (${distance} levels down): flagged for human review`
        : `AI recommends ${clamped} (confidence ${aiConfidence.toFixed(2)} < 0.7): flagged for human review`,
  };
}
