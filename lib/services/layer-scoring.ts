import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { PRIMARY_BASELINE_ID } from '@/lib/methodology/scoring-config';
import {
  computeBaselineStructuralDistribution,
  extractWeekMetadata,
} from '@/lib/services/baseline-distributions';
import { synthesizeConvergence } from '@/lib/services/convergence-synthesis';
import { computeRollingThematicDrift } from '@/lib/services/semantic-drift-service';
import { computeStructuralScore } from '@/lib/services/structural-anomaly-service';
import type { WeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { AIAssessmentSummary, StructuralScore } from '@/lib/types/structural';

/**
 * Compute Layer 1 (structural anomaly) score for a category-week.
 * Returns null if metadata or baseline is unavailable.
 */
export async function computeStructuralLayer(
  category: string,
  weekOf: string,
): Promise<StructuralScore | null> {
  const weekMetadata = await extractWeekMetadata(category, weekOf);
  if (!weekMetadata) return null;

  const primaryConfig = BASELINE_CONFIGS.find((c) => c.id === PRIMARY_BASELINE_ID);
  if (!primaryConfig) return null;

  const baselineDistribution = await computeBaselineStructuralDistribution(primaryConfig, category);
  if (!baselineDistribution) return null;

  return computeStructuralScore(weekMetadata, baselineDistribution);
}

/**
 * Enrich a weekly aggregate with Layer 1 (structural), Layer 2 (AI), and Layer 3 (thematic) scores,
 * plus the convergence synthesis.
 */
export async function enrichWithLayerScores(
  agg: WeeklyAggregate,
  aiSummary?: AIAssessmentSummary | null,
): Promise<WeeklyAggregate> {
  try {
    const [structural, thematic] = await Promise.all([
      computeStructuralLayer(agg.category, agg.weekOf),
      computeRollingThematicDrift(agg.category, agg.weekOf),
    ]);

    const convergence = synthesizeConvergence(
      structural,
      aiSummary ?? null,
      thematic,
      agg.category,
    );

    return {
      ...agg,
      structuralScore: structural?.composite ?? undefined,
      structuralDetail: structural ?? undefined,
      thematicScore: thematic?.zScore ?? undefined,
      thematicDetail: thematic ?? undefined,
      convergenceScore: convergence.layersElevated,
      convergenceDetail: convergence,
      aiScore: aiSummary?.flagRateZScore ?? undefined,
      aiDetail: aiSummary ?? undefined,
    };
  } catch (err) {
    console.warn(`[layer-scoring] Failed for ${agg.category}/${agg.weekOf}:`, err);
    return agg;
  }
}
