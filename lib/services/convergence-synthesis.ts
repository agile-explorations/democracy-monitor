import {
  AI_CONCERN_MIN_SAMPLE,
  AI_CONCERN_THRESHOLD,
  AI_FLAG_RATE_MIN_DOCS,
  AI_FLAG_RATE_STRONG_THRESHOLD,
  AI_FLAG_RATE_THRESHOLD,
  getStructuralThreshold,
  THEMATIC_DRIFT_ELEVATED,
} from '@/lib/methodology/scoring-config';
import type {
  AIAssessmentSummary,
  ConvergenceStatus,
  ConvergenceSynthesis,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

/**
 * Synthesize convergence status from Layer 1 (structural) + Layer 2 (AI) + Layer 3 (thematic).
 *
 * Status determination:
 *   Stable           — all layers within baseline ranges
 *   Elevated         — one layer showing significant deviation
 *   Divergent        — two or more layers deviating
 *   ConfirmedConcern — two or more layers deviating AND high AI concern rate
 *
 * L3 operates in reinforcement-only mode: thematic drift can upgrade a signal
 * that L1 or L2 already flagged (Elevated → Divergent), but cannot independently
 * trigger Elevated status. Empirical validation shows L3 has high false-positive
 * rate (~44% of baseline weeks) with zero independent true detections, due to
 * baseline contamination from content-less stubs and metadata-only embeddings.
 * Re-evaluate after clean baseline recomputation.
 *
 * AI layer is not affected by bootstrap.
 */
export function synthesizeConvergence(
  structural: StructuralScore | null,
  aiAssessment: AIAssessmentSummary | null,
  thematic: ThematicDriftScore | null,
  category?: string,
): ConvergenceSynthesis {
  const structuralElevated = isStructuralElevated(structural, category);
  const aiElevated = isAIElevated(aiAssessment);
  const thematicElevated = isThematicElevated(thematic);
  const isBootstrap = thematic?.bootstrap ?? true;

  const layersElevated = countElevatedLayers(structuralElevated, aiElevated, thematicElevated);
  const highConcern = isHighConcern(aiAssessment);
  const status = determineStatus(layersElevated, highConcern);
  const pattern = describePattern(structuralElevated, aiElevated, thematicElevated, isBootstrap);

  return {
    status,
    structuralElevated,
    aiElevated,
    thematicElevated,
    layersElevated,
    pattern,
    bootstrap: isBootstrap,
  };
}

function isStructuralElevated(structural: StructuralScore | null, category?: string): boolean {
  if (!structural) return false;
  const threshold = getStructuralThreshold(category ?? '');
  return structural.composite > threshold;
}

function isAIElevated(aiAssessment: AIAssessmentSummary | null): boolean {
  if (!aiAssessment) return false;
  if (aiAssessment.totalDocuments < AI_FLAG_RATE_MIN_DOCS) return false;
  if (aiAssessment.flagRateZScore <= AI_FLAG_RATE_THRESHOLD) return false;
  // P1 flag rate is elevated — require P2 corroboration or very strong flag rate
  return (
    aiAssessment.concernRate > 0 || aiAssessment.flagRateZScore > AI_FLAG_RATE_STRONG_THRESHOLD
  );
}

function isThematicElevated(thematic: ThematicDriftScore | null): boolean {
  if (!thematic) return false;
  return Math.abs(thematic.zScore) > THEMATIC_DRIFT_ELEVATED;
}

function isHighConcern(aiAssessment: AIAssessmentSummary | null): boolean {
  if (!aiAssessment) return false;
  const { concernDistribution: d } = aiAssessment;
  const pass2Count =
    d.routine + d.novelNotConcerning + d.potentiallyConcerning + d.clearlyConcerning;
  if (pass2Count < AI_CONCERN_MIN_SAMPLE) return false;
  return aiAssessment.concernRate > AI_CONCERN_THRESHOLD;
}

function countElevatedLayers(
  structuralElevated: boolean,
  aiElevated: boolean,
  thematicElevated: boolean,
): number {
  let count = 0;
  if (structuralElevated) count++;
  if (aiElevated) count++;
  // L3 reinforcement-only: thematic drift can upgrade existing L1/L2 signals
  // but cannot independently trigger elevation (insufficient specificity for
  // standalone detection — re-evaluate after clean baseline recomputation)
  if (thematicElevated && (structuralElevated || aiElevated)) count++;
  return count;
}

function determineStatus(layersElevated: number, highConcern: boolean): ConvergenceStatus {
  if (layersElevated >= 2 && highConcern) return 'ConfirmedConcern';
  if (layersElevated >= 2) return 'Divergent';
  if (layersElevated === 1) return 'Elevated';
  return 'Stable';
}

function describePattern(
  structuralElevated: boolean,
  aiElevated: boolean,
  thematicElevated: boolean,
  isBootstrap: boolean,
): string {
  if (!structuralElevated && !aiElevated && !thematicElevated) {
    return 'All layers within baseline ranges';
  }

  const parts: string[] = [];
  if (structuralElevated) parts.push('structural anomaly detected');
  if (aiElevated) parts.push('AI flag rate elevated');
  if (thematicElevated) {
    parts.push(
      isBootstrap
        ? 'thematic drift detected (bootstrap, reduced confidence)'
        : 'thematic drift detected',
    );
  }

  return parts.join('; ');
}
