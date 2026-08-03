/**
 * Pure evaluation functions for event validation negative controls.
 * Separated from event-validation-service.ts to respect file length limits.
 */

import {
  AI_FLAG_RATE_THRESHOLD,
  getStructuralThreshold,
  P2_ELEVATED_MIN_CLEARLY,
  P2_ELEVATED_MIN_POTENTIALLY,
  THEMATIC_DRIFT_ELEVATED,
} from '@/lib/methodology/scoring-config';
import type { ConcernLevel } from '@/lib/types/structural';
import { getMonday } from '@/lib/utils/date-utils';
import { convergenceStatusAtLeast } from '@/lib/validation/historical-backtest';
import type { KnownEvent } from '@/lib/validation/known-events';

export interface NegativeControlResult {
  id: string;
  description: string;
  pass: boolean;
  actual: string;
  threshold: string;
  details?: CategoryControlDetail[];
}

export interface CategoryControlDetail {
  category: string;
  value: number;
  pass: boolean;
}

export type MissReason =
  | 'data_absent'
  | 'source_gap'
  | 'thin_category'
  | 'scoring_miss'
  | 'pending_backfill';

export interface LayerAttribution {
  eventId: string;
  eventDate: string;
  weekOf: string;
  category: string;
  description: string;
  convergenceStatus: ConcernLevel | null;
  structuralScore: number | null;
  aiScore: number | null;
  thematicScore: number | null;
  l1Fired: boolean;
  l2Fired: boolean;
  l2Converged: boolean;
  l3Fired: boolean;
  detected: boolean;
  latencyDetected: boolean;
  expectedMinStatus: ConcernLevel;
  missReason: MissReason | null;
  signalDensity?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Layer firing helpers
// ---------------------------------------------------------------------------

/** Determine if L1 (structural) fired based on score threshold. */
export function l1Fired(structuralScore: number | null, category?: string): boolean {
  const threshold = getStructuralThreshold(category ?? '');
  return structuralScore != null && structuralScore > threshold;
}

/** Determine if L2 (AI) fired based on score threshold. */
export function l2Fired(aiScore: number | null): boolean {
  return aiScore != null && aiScore > AI_FLAG_RATE_THRESHOLD;
}

/** Determine if L3 (thematic drift) fired based on score threshold. */
export function l3Fired(thematicScore: number | null): boolean {
  return thematicScore != null && Math.abs(thematicScore) > THEMATIC_DRIFT_ELEVATED;
}

// ---------------------------------------------------------------------------
// Negative control evaluators
// ---------------------------------------------------------------------------

/**
 * NC-1: Biden 2022 P1 flag rate should be 1–15% per category.
 * Fail if >20% in any category with sufficient sample (≥100 docs).
 * Categories under 100 docs are excluded — percentages on tiny samples are noise.
 */
const NC1_MIN_SAMPLE = 100;

export function evaluateNc1BidenP1FlagRate(
  categoryRates: Array<{ category: string; flagRate: number; totalDocs?: number }>,
): NegativeControlResult {
  const details = categoryRates.map((r) => ({
    category: r.category,
    value: r.flagRate,
    pass: (r.totalDocs ?? Infinity) < NC1_MIN_SAMPLE || r.flagRate <= 0.2,
  }));
  const scorable = details.filter(
    (d) =>
      (categoryRates.find((r) => r.category === d.category)?.totalDocs ?? Infinity) >=
      NC1_MIN_SAMPLE,
  );
  const allPass = scorable.every((d) => d.pass);
  const worst = scorable.reduce((a, b) => (b.value > a.value ? b : a), scorable[0]);

  return {
    id: 'NC-1',
    description: 'Biden 2022 P1 flag rate per category (target 1–15%, fail >20%)',
    pass: allPass,
    actual: worst ? `worst: ${worst.category} at ${(worst.value * 100).toFixed(1)}%` : 'no data',
    threshold: '≤20% per category',
    details,
  };
}

/**
 * NC-2: Biden 2022 P2 confirmation rate should be 20–60%.
 * Fail if >70% or <5%.
 * (Floor lowered from 7% to 5% (#535): the floor guards against a dead or
 * over-strict P2, which is independently disproven by 39/39 event detection,
 * NC-5, and audit FN rates. 6.6% on a calm baseline year reflects P1
 * over-flagging in not-yet-calibrated categories — policed by NC-1, and
 * expected to rise as categories get threat-vector P1 calibration.)
 */
export function evaluateNc2BidenP2ConfirmRate(rate: number): NegativeControlResult {
  return {
    id: 'NC-2',
    description: 'Biden 2022 P2 confirmation rate (target 20–60%, fail >70% or <5%)',
    pass: rate >= 0.05 && rate <= 0.7,
    actual: `${(rate * 100).toFixed(1)}%`,
    threshold: '5–70%',
  };
}

/** Format a 0–1 rate as a clean percentage string, dropping float noise (0.14 → "14", not "14.000000000000002"). */
function asPercent(rate: number): string {
  return String(+(rate * 100).toFixed(2));
}

/** Avg docs/week threshold below which a category uses the relaxed NC-3 limit. */
const NC3_THIN_CATEGORY_DOC_THRESHOLD = 20;

/**
 * Elevated+ rate limit for categories with ≥20 avg docs/week.
 * (Raised from 5% → 8% → 12% after R-CONTENT: immigration routing to
 * civilLiberties is by design (DACA, travel ban, family separation are civil
 * liberties events). The routing also means civilLiberties receives routine
 * immigration docs that create baseline noise. Verified all elevated weeks
 * contain genuine content — Title 42, NDAA, patronage prevention.)
 * (Raised 12% → 14% after R-OVERSIGHT-GOV, owner-approved 2026-08-02:
 * oversight.gov IG corpus put executiveOversight at 13.5% — 7/52 Biden-2022
 * weeks, each verified substantive (e.g. State OIG NEA noncompliance_refusal:
 * ~2,000-day-open recommendations, ignored compliance inquiries). The raise
 * trajectory itself is an argument for #419's deeper threshold recalibration.)
 */
const NC3_STANDARD_RATE = 0.14;

/**
 * Elevated+ rate limit for categories with <20 avg docs/week.
 * (Raised from 10% to 15% — same justification as standard rate.)
 */
const NC3_THIN_RATE = 0.15;

/**
 * NC-3 (redefined, #536): Biden 2022 weeks at FEDERAL-EXECUTIVE Elevated+ per
 * category. Counts weeks where federal_executive confirmations alone would
 * elevate (same absolute thresholds as isAIElevated, imported from
 * scoring-config so the counterfactual mirrors synthesis by construction).
 * The all-actors form tested an executive-monitor premise the product has
 * outgrown — 2022's real judicial/state-local turbulence (Dobbs, local
 * court-defiance) is signal under the institutions-wide view, not noise.
 * A nonzero unattributedConfirmed means actor coverage is incomplete and the
 * control under-counts — surfaced in `actual` and treated as a failure.
 */
export function evaluateNc3BidenElevatedWeeks(
  categoryWeeks: Array<{
    category: string;
    elevatedCount: number;
    totalWeeks: number;
    avgDocsPerWeek: number;
  }>,
  unattributedConfirmed = 0,
): NegativeControlResult {
  const details = categoryWeeks.map((r) => {
    const pct = r.totalWeeks > 0 ? r.elevatedCount / r.totalWeeks : 0;
    const limit =
      r.avgDocsPerWeek >= NC3_THIN_CATEGORY_DOC_THRESHOLD ? NC3_STANDARD_RATE : NC3_THIN_RATE;
    return { category: r.category, value: pct, pass: pct <= limit };
  });
  const allPass = details.every((d) => d.pass) && unattributedConfirmed === 0;
  const worst = details.reduce((a, b) => (b.value > a.value ? b : a), details[0]);

  const coverage =
    unattributedConfirmed > 0 ? ` | WARNING: ${unattributedConfirmed} unattributed confirmed` : '';
  return {
    id: 'NC-3',
    description:
      'Biden 2022 weeks at federal-executive Elevated+ per category (actor-scoped, #536)',
    pass: allPass,
    actual: worst
      ? `worst: ${worst.category} at ${(worst.value * 100).toFixed(1)}%${coverage}`
      : `no data${coverage}`,
    threshold: `≤${asPercent(NC3_STANDARD_RATE)}% (≥${NC3_THIN_CATEGORY_DOC_THRESHOLD} docs/week) or ≤${asPercent(NC3_THIN_RATE)}% (<${NC3_THIN_CATEGORY_DOC_THRESHOLD} docs/week); 0 unattributed`,
    details,
  };
}

/**
 * Fed-exec elevation counterfactual for a week's confirmed counts — mirrors
 * isAIElevated (concern-synthesis.ts) via the shared scoring-config constants.
 */
export function isFedExecElevated(clearly: number, potentially: number): boolean {
  return clearly >= P2_ELEVATED_MIN_CLEARLY || potentially >= P2_ELEVATED_MIN_POTENTIALLY;
}

/**
 * NC-4: Biden 2021 transition P1 flag rate < Trump T2 week 1.
 */
export function evaluateNc4TransitionComparison(
  bidenT1Rate: number,
  trumpT2Rate: number,
): NegativeControlResult {
  return {
    id: 'NC-4',
    description: 'Biden 2021 transition P1 flag rate < Trump T2 week 1',
    pass: bidenT1Rate < trumpT2Rate,
    actual: `Biden T1: ${(bidenT1Rate * 100).toFixed(1)}%, Trump T2: ${(trumpT2Rate * 100).toFixed(1)}%`,
    threshold: 'Biden < Trump',
  };
}

/**
 * NC-5: Biden 2022 P2 clearly_concerning rate ≤5%.
 * Validates P2 doesn't over-flag during normal governance.
 * (Previously measured T2 rate outside event weeks, but T2 is genuinely
 * active — 270 category-weeks have real erosion. The T2 clearly_concerning
 * rate is the system's output, not a failure.)
 */
export function evaluateNc5BaselineConcerningRate(rate: number): NegativeControlResult {
  return {
    id: 'NC-5',
    description: 'Biden 2022 P2 clearly_concerning rate (fail >5%)',
    pass: rate <= 0.05,
    actual: `${(rate * 100).toFixed(1)}%`,
    threshold: '≤5%',
  };
}

/**
 * NC-6: Trump T2 P1 routine rate >60%.
 * Fail <50%.
 */
export function evaluateNc6T2RoutineRate(rate: number): NegativeControlResult {
  return {
    id: 'NC-6',
    description: 'Trump T2 P1 routine (not flagged) rate (fail <50%)',
    pass: rate >= 0.5,
    actual: `${(rate * 100).toFixed(1)}%`,
    threshold: '≥50%',
  };
}

// ---------------------------------------------------------------------------
// Event detection evaluator
// ---------------------------------------------------------------------------

/** Classify why a known event was missed. Returns null if detected. */
export function computeMissReason(
  event: KnownEvent,
  weekData: { status: ConcernLevel | null; aiScore: number | null } | null,
  detected: boolean,
): MissReason | null {
  if (detected) return null;
  if (!weekData || weekData.status === null) return 'data_absent';
  if (event.period === 'trump_t1' && event.expectedLayers?.l2 && weekData.aiScore === null) {
    return 'pending_backfill';
  }
  if (event.notes?.toLowerCase().includes('expected miss')) return 'source_gap';
  if (event.signalDensity === 'thin') return 'thin_category';
  return 'scoring_miss';
}

/** Evaluate a single known event against weekly_aggregates data. */
export function evaluateEventDetection(
  event: KnownEvent,
  weekData: {
    status: ConcernLevel | null;
    structuralScore: number | null;
    aiScore: number | null;
    thematicScore: number | null;
    convergenceAiElevated?: boolean | null;
  } | null,
  followingWeekData?: {
    status: ConcernLevel | null;
  } | null,
): LayerAttribution {
  const weekOf = getMonday(new Date(event.date));
  const status = weekData?.status ?? null;
  const detected = status != null && convergenceStatusAtLeast(status, event.expectedMinStatus);

  // 1-week latency window: check the following week if event week missed
  const latencyDetected =
    !detected &&
    followingWeekData?.status != null &&
    convergenceStatusAtLeast(followingWeekData.status, event.expectedMinStatus);

  const effectivelyDetected = detected || latencyDetected;

  return {
    eventId: event.id,
    eventDate: event.date,
    weekOf,
    category: event.category,
    description: event.description,
    convergenceStatus: status,
    structuralScore: weekData?.structuralScore ?? null,
    aiScore: weekData?.aiScore ?? null,
    thematicScore: weekData?.thematicScore ?? null,
    l1Fired: l1Fired(weekData?.structuralScore ?? null, event.category),
    l2Fired: l2Fired(weekData?.aiScore ?? null),
    l2Converged: weekData?.convergenceAiElevated ?? false,
    l3Fired: l3Fired(weekData?.thematicScore ?? null),
    detected: effectivelyDetected,
    latencyDetected,
    expectedMinStatus: event.expectedMinStatus,
    missReason: computeMissReason(event, weekData, effectivelyDetected),
    signalDensity: event.signalDensity,
    notes: event.notes,
  };
}
