import {
  STRUCTURAL_ANOMALY_THRESHOLD,
  THEMATIC_DRIFT_ELEVATED,
} from '@/lib/methodology/scoring-config';
import type {
  ConvergenceStatus,
  ConvergenceSynthesis,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

/**
 * Synthesize convergence status from Layer 1 (structural) + Layer 3 (thematic).
 * Partial synthesis — Layer 2 (AI) integration deferred to Sprint R3.
 *
 * Status determination:
 *   Stable    — both layers within baseline ranges
 *   Elevated  — one layer showing significant deviation
 *   Divergent — both layers deviating (without L2 confirmation, cannot reach "Confirmed Concern")
 *
 * During bootstrap (Layer 3 insufficient rolling data), thematic drift alone
 * cannot trigger Elevated — only structural can.
 */
export function synthesizeConvergence(
  structural: StructuralScore | null,
  thematic: ThematicDriftScore | null,
): ConvergenceSynthesis {
  const structuralElevated = isStructuralElevated(structural);
  const thematicElevated = isThematicElevated(thematic);
  const isBootstrap = thematic?.bootstrap ?? true;

  const layersElevated = countElevatedLayers(structuralElevated, thematicElevated, isBootstrap);
  const status = determineStatus(layersElevated);
  const pattern = describePattern(structuralElevated, thematicElevated, isBootstrap);

  return {
    status,
    structuralElevated,
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

function isThematicElevated(thematic: ThematicDriftScore | null): boolean {
  if (!thematic) return false;
  return Math.abs(thematic.zScore) > THEMATIC_DRIFT_ELEVATED;
}

function countElevatedLayers(
  structuralElevated: boolean,
  thematicElevated: boolean,
  isBootstrap: boolean,
): number {
  let count = 0;
  if (structuralElevated) count++;
  // During bootstrap, thematic drift alone doesn't count
  if (thematicElevated && !isBootstrap) count++;
  // During bootstrap, thematic can still reinforce structural
  if (thematicElevated && isBootstrap && structuralElevated) count++;
  return count;
}

function determineStatus(layersElevated: number): ConvergenceStatus {
  if (layersElevated >= 2) return 'Divergent';
  if (layersElevated === 1) return 'Elevated';
  return 'Stable';
}

function describePattern(
  structuralElevated: boolean,
  thematicElevated: boolean,
  isBootstrap: boolean,
): string {
  if (!structuralElevated && !thematicElevated) {
    return 'All layers within baseline ranges';
  }

  const parts: string[] = [];
  if (structuralElevated) parts.push('structural anomaly detected');
  if (thematicElevated) {
    parts.push(
      isBootstrap
        ? 'thematic drift detected (bootstrap, reduced confidence)'
        : 'thematic drift detected',
    );
  }

  return parts.join('; ');
}
