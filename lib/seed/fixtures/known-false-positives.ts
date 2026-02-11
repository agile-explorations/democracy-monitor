/**
 * Known false positive keywords — these should NOT trigger in the given context.
 *
 * Populated during review cycles. Each entry represents a keyword+context
 * combination that was confirmed by human review as a false positive.
 *
 * Used as regression tests: after keyword dictionary changes, verify that
 * none of these entries trigger a match at the specified tier.
 */

export interface FalsePositiveEntry {
  keyword: string;
  category: string;
  context: string;
  reason: string;
}

// Initially empty — populated during first review cycle (Sprint 14)
export const KNOWN_FALSE_POSITIVES: FalsePositiveEntry[] = [];
