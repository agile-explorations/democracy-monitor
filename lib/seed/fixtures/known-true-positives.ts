/**
 * Known true positive keywords — these should always trigger at the expected tier.
 *
 * Populated during review cycles. Each entry represents a keyword that was
 * confirmed by human review as a genuine signal for the given category and tier.
 *
 * Used as regression tests: after keyword dictionary changes, verify that all
 * entries still match at or above the expected tier.
 */

export interface TruePositiveEntry {
  keyword: string;
  category: string;
  tier: 'capture' | 'drift' | 'warning';
  reason: string;
}

// Initially empty — populated during first review cycle (Sprint 14)
export const KNOWN_TRUE_POSITIVES: TruePositiveEntry[] = [];
