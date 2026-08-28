/**
 * Prompt-side glue for the deterministic number check (#700): the allowed
 * set a weekly summary may draw its counts from, and the feedback text for
 * the one targeted revision the pipeline runs when the check fails. Kept
 * apart from narrative-prompts.ts (size) and narrative-number-check.ts
 * (which must stay prompt-agnostic).
 */

import { allowedNumbersFrom, describeViolation } from '@/lib/services/narrative-number-check';
import type { NumberViolation } from '@/lib/services/narrative-number-check';
import { buildFactualSummary } from '@/lib/services/narrative-prompts';
import type { WeeklySummaryInput } from '@/lib/types';

/** The integers the FACTUAL DATA block hands the model — the only figures a
 *  weekly summary may state as counts or totals. */
export function weeklyFactualNumbers(input: WeeklySummaryInput): Set<number> {
  return allowedNumbersFrom(buildFactualSummary(input), input.categories.length);
}

/** Feedback text for the targeted revision pass. */
export function buildNumberViolationFeedback(violations: NumberViolation[]): string {
  return [
    '(a) FACTUAL ACCURACY — NUMERIC CHECK FAILED. A deterministic check found figures that do',
    'not appear in the FACTUAL DATA block, or an enumerated list whose length disagrees with its',
    'count word. Correct each one using ONLY the FACTUAL DATA figures; do not derive or estimate:',
    ...violations.map((v, i) => `  ${i + 1}. ${describeViolation(v)}`),
    '(b)–(f): no further changes required — keep the analysis otherwise as written.',
  ].join('\n');
}
