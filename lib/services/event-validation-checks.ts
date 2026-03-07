/**
 * Pure evaluation functions for event validation negative controls.
 * Separated from event-validation-service.ts to respect file length limits.
 */

import {
  STRUCTURAL_ANOMALY_THRESHOLD,
  AI_FLAG_RATE_THRESHOLD,
  THEMATIC_DRIFT_ELEVATED,
} from '@/lib/methodology/scoring-config';
import type { ConvergenceStatus } from '@/lib/types/structural';
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

export interface LayerAttribution {
  eventId: string;
  eventDate: string;
  weekOf: string;
  category: string;
  description: string;
  convergenceStatus: ConvergenceStatus | null;
  structuralScore: number | null;
  aiScore: number | null;
  thematicScore: number | null;
  l1Fired: boolean;
  l2Fired: boolean;
  l3Fired: boolean;
  detected: boolean;
  expectedMinStatus: ConvergenceStatus;
  signalDensity?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Layer firing helpers
// ---------------------------------------------------------------------------

/** Determine if L1 (structural) fired based on score threshold. */
export function l1Fired(structuralScore: number | null): boolean {
  return structuralScore != null && structuralScore > STRUCTURAL_ANOMALY_THRESHOLD;
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
 * Fail if >20% in any category.
 */
export function evaluateNc1BidenP1FlagRate(
  categoryRates: Array<{ category: string; flagRate: number }>,
): NegativeControlResult {
  const details = categoryRates.map((r) => ({
    category: r.category,
    value: r.flagRate,
    pass: r.flagRate <= 0.2,
  }));
  const allPass = details.every((d) => d.pass);
  const worst = details.reduce((a, b) => (b.value > a.value ? b : a), details[0]);

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
 * Fail if >70% or <8%.
 */
export function evaluateNc2BidenP2ConfirmRate(rate: number): NegativeControlResult {
  return {
    id: 'NC-2',
    description: 'Biden 2022 P2 confirmation rate (target 20–60%, fail >70% or <8%)',
    pass: rate >= 0.08 && rate <= 0.7,
    actual: `${(rate * 100).toFixed(1)}%`,
    threshold: '8–70%',
  };
}

/**
 * NC-3: Biden 2022 weeks at Elevated+ should be ≤2 of ~52 per category.
 * Fail if >5% of weeks are Elevated+.
 */
export function evaluateNc3BidenElevatedWeeks(
  categoryWeeks: Array<{ category: string; elevatedCount: number; totalWeeks: number }>,
): NegativeControlResult {
  const details = categoryWeeks.map((r) => {
    const pct = r.totalWeeks > 0 ? r.elevatedCount / r.totalWeeks : 0;
    return { category: r.category, value: pct, pass: pct <= 0.05 };
  });
  const allPass = details.every((d) => d.pass);
  const worst = details.reduce((a, b) => (b.value > a.value ? b : a), details[0]);

  return {
    id: 'NC-3',
    description: 'Biden 2022 weeks at Elevated+ per category (fail >5%)',
    pass: allPass,
    actual: worst ? `worst: ${worst.category} at ${(worst.value * 100).toFixed(1)}%` : 'no data',
    threshold: '≤5% of weeks',
    details,
  };
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
 * NC-5: Trump T2 P2 clearly_concerning rate outside event weeks <10%.
 * Fail >15%.
 */
export function evaluateNc5T2ConcerningRate(rate: number): NegativeControlResult {
  return {
    id: 'NC-5',
    description: 'Trump T2 P2 clearly_concerning rate outside event weeks (fail >15%)',
    pass: rate <= 0.15,
    actual: `${(rate * 100).toFixed(1)}%`,
    threshold: '≤15%',
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

/** Evaluate a single known event against weekly_aggregates data. */
export function evaluateEventDetection(
  event: KnownEvent,
  weekData: {
    status: ConvergenceStatus | null;
    structuralScore: number | null;
    aiScore: number | null;
    thematicScore: number | null;
  } | null,
): LayerAttribution {
  const weekOf = getMonday(new Date(event.date));
  const status = weekData?.status ?? null;

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
    l1Fired: l1Fired(weekData?.structuralScore ?? null),
    l2Fired: l2Fired(weekData?.aiScore ?? null),
    l3Fired: l3Fired(weekData?.thematicScore ?? null),
    detected: status != null && convergenceStatusAtLeast(status, event.expectedMinStatus),
    expectedMinStatus: event.expectedMinStatus,
    signalDensity: event.signalDensity,
    notes: event.notes,
  };
}
