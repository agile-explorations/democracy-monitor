import {
  AI_CONCERN_THRESHOLD,
  AI_FLAG_RATE_THRESHOLD,
  STRUCTURAL_ANOMALY_THRESHOLD,
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
 * During bootstrap (Layer 3 insufficient rolling data), thematic drift alone
 * cannot trigger Elevated — only structural and AI can.
 * AI layer is not affected by bootstrap.
 */
export function synthesizeConvergence(
  structural: StructuralScore | null,
  aiAssessment: AIAssessmentSummary | null,
  thematic: ThematicDriftScore | null,
): ConvergenceSynthesis {
  const structuralElevated = isStructuralElevated(structural);
  const aiElevated = isAIElevated(aiAssessment);
  const thematicElevated = isThematicElevated(thematic);
  const isBootstrap = thematic?.bootstrap ?? true;

  const layersElevated = countElevatedLayers(
    structuralElevated,
    aiElevated,
    thematicElevated,
    isBootstrap,
  );
  const highConcern = aiAssessment ? aiAssessment.concernRate > AI_CONCERN_THRESHOLD : false;
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

function isStructuralElevated(structural: StructuralScore | null): boolean {
  if (!structural) return false;
  return structural.composite > STRUCTURAL_ANOMALY_THRESHOLD;
}

function isAIElevated(aiAssessment: AIAssessmentSummary | null): boolean {
  if (!aiAssessment) return false;
  return aiAssessment.flagRateZScore > AI_FLAG_RATE_THRESHOLD;
}

function isThematicElevated(thematic: ThematicDriftScore | null): boolean {
  if (!thematic) return false;
  return Math.abs(thematic.zScore) > THEMATIC_DRIFT_ELEVATED;
}

function countElevatedLayers(
  structuralElevated: boolean,
  aiElevated: boolean,
  thematicElevated: boolean,
  isBootstrap: boolean,
): number {
  let count = 0;
  if (structuralElevated) count++;
  if (aiElevated) count++;
  // During bootstrap, thematic drift alone doesn't count
  if (thematicElevated && !isBootstrap) count++;
  // During bootstrap, thematic can still reinforce other layers
  if (thematicElevated && isBootstrap && (structuralElevated || aiElevated)) count++;
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
