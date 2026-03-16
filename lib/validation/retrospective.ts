/**
 * Event retrospective harness — re-runs detection pipeline from scratch
 * using current thresholds and stored data. Compares recomputed status
 * against both expected status and stored weekly_aggregates status.
 */

import { sql } from 'drizzle-orm';
import { getBaselineConfigForCycleYear } from '@/lib/data/baselines';
import { getDb } from '@/lib/db';
import { getCycleYearForDate } from '@/lib/methodology/scoring-config';
import {
  computeBaselineStructuralDistribution,
  extractWeekMetadata,
} from '@/lib/services/baseline-distributions';
import { synthesizeConvergence } from '@/lib/services/convergence-synthesis';
import { buildAISummaryFromDB } from '@/lib/services/layer2-summary';
import { computeRollingThematicDrift } from '@/lib/services/semantic-drift-service';
import { computeStructuralScore } from '@/lib/services/structural-anomaly-service';
import type {
  AIAssessmentSummary,
  ConvergenceStatus,
  ConvergenceSynthesis,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';
import { getMonday } from '@/lib/utils/date-utils';
import { convergenceStatusAtLeast } from './historical-backtest';
import type { KnownEvent } from './known-events';

export interface RetrospectiveResult {
  event: KnownEvent;
  weekOf: string;
  /** Recomputed from current thresholds + stored data */
  recomputed: {
    structural: StructuralScore | null;
    ai: AIAssessmentSummary | null;
    thematic: ThematicDriftScore | null;
    convergence: ConvergenceSynthesis;
  };
  /** Stored in weekly_aggregates */
  stored: {
    status: ConvergenceStatus | null;
    structuralScore: number | null;
    aiScore: number | null;
    thematicScore: number | null;
  };
  /** Detection results */
  recomputedDetected: boolean;
  storedDetected: boolean;
  statusChanged: boolean;
}

/** Fetch stored weekly_aggregates data for a category-week. */
async function fetchStoredWeekData(
  category: string,
  weekOf: string,
): Promise<RetrospectiveResult['stored']> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT structural_score, ai_score, thematic_score,
           convergence_detail->>'status' as status
    FROM weekly_aggregates
    WHERE category = ${category} AND week_of = ${weekOf}
    LIMIT 1
  `);
  const row = rows.rows[0] as Record<string, unknown> | undefined;
  if (!row) return { status: null, structuralScore: null, aiScore: null, thematicScore: null };
  return {
    status: (row.status as ConvergenceStatus) ?? null,
    structuralScore: row.structural_score != null ? Number(row.structural_score) : null,
    aiScore: row.ai_score != null ? Number(row.ai_score) : null,
    thematicScore: row.thematic_score != null ? Number(row.thematic_score) : null,
  };
}

/** Run the retrospective for a single known event. */
export async function evaluateEvent(event: KnownEvent): Promise<RetrospectiveResult> {
  const weekOf = getMonday(new Date(event.date));
  const cycleYear = getCycleYearForDate(weekOf);
  const config = getBaselineConfigForCycleYear(cycleYear);

  // L1: Recompute structural score
  let structural: StructuralScore | null = null;
  if (config) {
    const weekMetadata = await extractWeekMetadata(event.category, weekOf);
    const baselineDistribution = await computeBaselineStructuralDistribution(
      config,
      event.category,
    );
    if (weekMetadata && baselineDistribution) {
      structural = computeStructuralScore(weekMetadata, baselineDistribution);
    }
  }

  // L2: Build AI summary from stored assessments (no API calls)
  const ai = await buildAISummaryFromDB(event.category, weekOf);

  // L3: Recompute thematic drift
  let thematic: ThematicDriftScore | null = null;
  try {
    thematic = await computeRollingThematicDrift(event.category, weekOf);
  } catch {
    // L3 may fail if embeddings/baselines are missing
  }

  // Convergence synthesis with current thresholds
  const convergence = synthesizeConvergence(structural, ai, thematic, event.category);

  // Fetch stored data for comparison
  const stored = await fetchStoredWeekData(event.category, weekOf);

  const recomputedDetected = convergenceStatusAtLeast(convergence.status, event.expectedMinStatus);
  const storedDetected =
    stored.status != null && convergenceStatusAtLeast(stored.status, event.expectedMinStatus);

  return {
    event,
    weekOf,
    recomputed: { structural, ai, thematic, convergence },
    stored,
    recomputedDetected,
    storedDetected,
    statusChanged: stored.status !== convergence.status,
  };
}

/** Run the retrospective for a list of known events. */
export async function runRetrospective(events: KnownEvent[]): Promise<RetrospectiveResult[]> {
  const results: RetrospectiveResult[] = [];
  for (const event of events) {
    results.push(await evaluateEvent(event));
  }
  return results;
}
