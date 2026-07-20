/**
 * Event validation service — orchestrates negative controls and event detection.
 *
 * Pure evaluation functions: event-validation-checks.ts
 * DB queries: event-validation-queries.ts
 */

import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { isDbAvailable } from '@/lib/db';
import type { ConcernLevel } from '@/lib/types/structural';
import { getMonday } from '@/lib/utils/date-utils';
import { convergenceStatusAtLeast } from '@/lib/validation/historical-backtest';
import { ALL_KNOWN_EVENTS } from '@/lib/validation/known-events';
import type { KnownEvent } from '@/lib/validation/known-events';
import type { LayerAttribution, NegativeControlResult } from './event-validation-checks';
import {
  evaluateEventDetection,
  evaluateNc1BidenP1FlagRate,
  evaluateNc2BidenP2ConfirmRate,
  evaluateNc3BidenElevatedWeeks,
  evaluateNc4TransitionComparison,
  evaluateNc5BaselineConcerningRate,
  evaluateNc6T2RoutineRate,
  isFedExecElevated,
} from './event-validation-checks';
import type { EvidenceDoc, WeekRow } from './event-validation-queries';
import {
  fetchEventEvidence,
  fetchP1FlagRates,
  fetchP2ConfirmationRate,
  fetchBaselineConcerningRate,
  fetchT2RoutineRate,
  fetchWeeklyData,
  fetchWeekP1FlagRate,
  fetchFedExecConcernCounts,
} from './event-validation-queries';

export type {
  NegativeControlResult,
  CategoryControlDetail,
  LayerAttribution,
  MissReason,
} from './event-validation-checks';
export {
  l1Fired,
  l2Fired,
  l3Fired,
  computeMissReason,
  evaluateNc1BidenP1FlagRate,
  evaluateNc2BidenP2ConfirmRate,
  evaluateNc3BidenElevatedWeeks,
  evaluateNc4TransitionComparison,
  evaluateNc5BaselineConcerningRate,
  evaluateNc6T2RoutineRate,
  evaluateEventDetection,
} from './event-validation-checks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventEvidence {
  eventId: string;
  category: string;
  weekOf: string;
  documents: EvidenceDoc[];
}

export interface PopulationSummary {
  totalWeeks: number;
  withStructural: number;
  withAi: number;
  withThematic: number;
  withAllLayers: number;
  sufficient: boolean;
}

export interface ValidationReport {
  populationSummary: PopulationSummary;
  negativeControls: NegativeControlResult[];
  eventDetection: LayerAttribution[];
  evidence: EventEvidence[];
  warnings: string[];
  summary: {
    controlsPassed: number;
    controlsFailed: number;
    eventsDetected: number;
    eventsMissed: number;
    eventsSkipped: number;
    totalEvents: number;
  };
}

export interface ValidateOptions {
  category?: string;
  evidence?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaselineRange(id: string): { from: string; to: string } | null {
  const config = BASELINE_CONFIGS.find((c) => c.id === id);
  if (config) return { from: config.from, to: config.to };
  if (id === 'trump_t2') return { from: '2025-01-20', to: '2026-12-31' };
  return null;
}

function buildPopulationSummary(t2Weeks: WeekRow[]): PopulationSummary {
  const withL1 = t2Weeks.filter((r) => r.structural_score != null).length;
  const withL2 = t2Weeks.filter((r) => r.ai_score != null).length;
  const withL3 = t2Weeks.filter((r) => r.thematic_score != null).length;
  const withAll = t2Weeks.filter(
    (r) => r.structural_score != null && r.ai_score != null && r.thematic_score != null,
  ).length;
  return {
    totalWeeks: t2Weeks.length,
    withStructural: withL1,
    withAi: withL2,
    withThematic: withL3,
    withAllLayers: withAll,
    sufficient: t2Weeks.length > 0 && withL2 / t2Weeks.length > 0.5,
  };
}

/** Exported for the NC-margin capture tool (nc:margins) — #556 rehearsal diffs. */
export async function runNegativeControls(catFilter?: string): Promise<NegativeControlResult[]> {
  const controls: NegativeControlResult[] = [];
  const b22 = getBaselineRange('biden_2022')!;

  controls.push(evaluateNc1BidenP1FlagRate(await fetchP1FlagRates(b22.from, b22.to, catFilter)));
  controls.push(evaluateNc2BidenP2ConfirmRate(await fetchP2ConfirmationRate(b22.from, b22.to)));

  // NC-3 (actor-scoped, #536): denominators (weeks, avg docs) still come from
  // weekly aggregates; the numerator is a federal-executive-only elevation
  // counterfactual computed directly from assessments, so the control does
  // not depend on aggregate enrichment freshness.
  const b22Weeks = await fetchWeeklyData(b22.from, b22.to, catFilter);
  const byCat = new Map<string, { elevated: number; total: number; totalDocs: number }>();
  for (const row of b22Weeks) {
    if (!byCat.has(row.category)) byCat.set(row.category, { elevated: 0, total: 0, totalDocs: 0 });
    const entry = byCat.get(row.category)!;
    entry.total++;
    entry.totalDocs += row.document_count ?? 0;
  }
  const fedExec = await fetchFedExecConcernCounts(b22.from, b22.to, catFilter);
  for (const wk of fedExec.weeks) {
    const entry = byCat.get(wk.category);
    if (entry && isFedExecElevated(wk.clearly, wk.potentially)) entry.elevated++;
  }
  controls.push(
    evaluateNc3BidenElevatedWeeks(
      [...byCat.entries()].map(([cat, d]) => ({
        category: cat,
        elevatedCount: d.elevated,
        totalWeeks: d.total,
        avgDocsPerWeek: d.total > 0 ? d.totalDocs / d.total : 0,
      })),
      fedExec.unattributedConfirmed,
    ),
  );

  const [bidenT1Rate, trumpT2Rate] = await Promise.all([
    fetchWeekP1FlagRate('2021-01-20', '2021-01-27'),
    fetchWeekP1FlagRate('2025-01-20', '2025-01-27'),
  ]);
  controls.push(evaluateNc4TransitionComparison(bidenT1Rate, trumpT2Rate));
  controls.push(
    evaluateNc5BaselineConcerningRate(
      await fetchBaselineConcerningRate('2022-01-20', '2023-01-19'),
    ),
  );
  controls.push(evaluateNc6T2RoutineRate(await fetchT2RoutineRate()));
  return controls;
}

function nextWeekMonday(monday: string): string {
  const d = new Date(monday + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

function runEventDetection(events: readonly KnownEvent[], lookup: Map<string, WeekRow>) {
  return events.map((event) => {
    const monday = getMonday(new Date(event.date));
    const key = `${event.category}:${monday}`;
    const row = lookup.get(key);

    // 1-week latency window: also check the following week
    const followingKey = `${event.category}:${nextWeekMonday(monday)}`;
    const followingRow = lookup.get(followingKey);

    return evaluateEventDetection(
      event,
      row
        ? {
            status: row.status as ConcernLevel | null,
            structuralScore: row.structural_score,
            aiScore: row.ai_score,
            thematicScore: row.thematic_score,
            convergenceAiElevated: row.convergence_ai_elevated,
          }
        : null,
      followingRow ? { status: followingRow.status as ConcernLevel | null } : null,
    );
  });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runValidation(opts: ValidateOptions = {}): Promise<ValidationReport> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const warnings: string[] = [];
  const events = opts.category
    ? ALL_KNOWN_EVENTS.filter((e) => e.category === opts.category)
    : ALL_KNOWN_EVENTS;

  const t2Weeks = await fetchWeeklyData('2025-01-13', '2026-12-31', opts.category);
  const pop = buildPopulationSummary(t2Weeks);
  if (!pop.sufficient) {
    warnings.push(
      `Layer scores insufficiently populated: ${pop.withAi}/${pop.totalWeeks} weeks have AI scores.`,
    );
  }

  const negativeControls = await runNegativeControls(opts.category);
  const allRows = await fetchWeeklyData('2017-01-01', '2026-12-31', opts.category);
  const lookup = new Map<string, WeekRow>();
  for (const row of allRows) lookup.set(`${row.category}:${String(row.week_of).slice(0, 10)}`, row);

  const eventDetection = runEventDetection(events, lookup);
  const evidence: EventEvidence[] = [];
  if (opts.evidence) {
    for (const attr of eventDetection.filter((e) => e.detected)) {
      const docs = await fetchEventEvidence(attr.category, attr.weekOf);
      if (docs.length > 0)
        evidence.push({
          eventId: attr.eventId,
          category: attr.category,
          weekOf: attr.weekOf,
          documents: docs,
        });
    }
  }

  return buildReport(pop, negativeControls, eventDetection, evidence, events.length, warnings);
}

function buildReport(
  pop: PopulationSummary,
  negativeControls: NegativeControlResult[],
  eventDetection: LayerAttribution[],
  evidence: EventEvidence[],
  totalEvents: number,
  warnings: string[],
): ValidationReport {
  const detected = eventDetection.filter((e) => e.detected).length;
  const missed = eventDetection.filter((e) => !e.detected && e.convergenceStatus !== null).length;
  const skipped = eventDetection.filter((e) => e.convergenceStatus === null).length;
  if (skipped > 0)
    warnings.push(`${skipped} event(s) have no weekly_aggregates data (insufficient data).`);

  return {
    populationSummary: pop,
    negativeControls,
    eventDetection,
    evidence,
    warnings,
    summary: {
      controlsPassed: negativeControls.filter((c) => c.pass).length,
      controlsFailed: negativeControls.filter((c) => !c.pass).length,
      eventsDetected: detected,
      eventsMissed: missed,
      eventsSkipped: skipped,
      totalEvents,
    },
  };
}
