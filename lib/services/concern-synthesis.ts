import {
  AI_CONCERN_MIN_SAMPLE,
  AI_CONCERN_THRESHOLD,
  P2_CONFIRMED_MIN_CLEARLY,
  P2_CONFIRMED_MIN_CONCERNING,
  P2_ELEVATED_MIN_CLEARLY,
  P2_ELEVATED_MIN_POTENTIALLY,
  getStructuralThreshold,
  THEMATIC_DRIFT_ELEVATED,
} from '@/lib/methodology/scoring-config';
import type { SilenceScore } from '@/lib/services/silence-detection-service';
import { SILENCE_Z_THRESHOLD } from '@/lib/services/silence-detection-service';
import type {
  AIAssessmentSummary,
  ConcernLevel,
  ConcernAssessment,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

/**
 * Synthesize convergence status from L2 (AI content assessment).
 *
 * Status determination (absolute P2 thresholds, no baseline comparison):
 *   Stable           — P2 found no concerning documents
 *   Elevated         — ≥1 clearly_concerning OR ≥2 potentially_concerning
 *   ConfirmedConcern — ≥2 clearly_concerning, OR ≥3 concerning with ≥20% rate
 *
 * Active detection layer:
 *   L2  — AI two-pass content assessment (sole detection layer)
 *
 * Descriptive context only (not scored):
 *   L1    — structural anomaly (narrative metadata)
 *   L1v2  — silence detection (source health indicator)
 *   L3    — thematic drift (narrative/research visualization)
 */
export function synthesizeConvergence(
  structural: StructuralScore | null,
  aiAssessment: AIAssessmentSummary | null,
  thematic: ThematicDriftScore | null,
  category?: string,
  silence?: SilenceScore | null,
): ConcernAssessment {
  const structuralElevated = isStructuralElevated(structural, category);
  const aiElevated = isAIElevated(aiAssessment);
  const silenceElevated = isSilenceElevated(silence);
  const thematicElevated = isThematicElevated(thematic);
  const isBootstrap = thematic?.bootstrap ?? true;

  const layersElevated = countElevatedLayers(aiElevated);
  const highConcern = isHighConcern(aiAssessment);
  const status = determineStatus(aiElevated, highConcern);
  const pattern = describePattern(
    structuralElevated,
    aiElevated,
    silenceElevated,
    thematicElevated,
  );

  return {
    status,
    structuralElevated,
    aiElevated,
    silenceElevated,
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
  const { concernDistribution: d } = aiAssessment;
  // Absolute P2 thresholds — no baseline comparison needed
  if (d.clearlyConcerning >= P2_ELEVATED_MIN_CLEARLY) return true;
  if (d.potentiallyConcerning >= P2_ELEVATED_MIN_POTENTIALLY) return true;
  return false;
}

function isSilenceElevated(silence: SilenceScore | null | undefined): boolean {
  if (!silence) return false;
  return silence.conspicuous;
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
  // Path 1: multiple clearly_concerning docs alone trigger ConfirmedConcern
  if (d.clearlyConcerning >= P2_CONFIRMED_MIN_CLEARLY) return true;
  // Path 2: enough concerning docs with high concern rate
  const concerning = d.potentiallyConcerning + d.clearlyConcerning;
  return (
    concerning >= P2_CONFIRMED_MIN_CONCERNING && aiAssessment.concernRate > AI_CONCERN_THRESHOLD
  );
}

/**
 * Count actively-scored elevated layers.
 * L2 (AI content assessment) is the sole detection layer.
 * Silence, structural, and thematic are descriptive context only.
 */
function countElevatedLayers(aiElevated: boolean): number {
  return aiElevated ? 1 : 0;
}

function determineStatus(aiElevated: boolean, highConcern: boolean): ConcernLevel {
  if (aiElevated && highConcern) return 'ConfirmedConcern';
  if (aiElevated) return 'Elevated';
  return 'Stable';
}

function describePattern(
  structuralElevated: boolean,
  aiElevated: boolean,
  silenceElevated: boolean,
  thematicElevated: boolean,
): string {
  const parts: string[] = [];

  // Active detection layer
  if (aiElevated) parts.push('AI content assessment elevated');

  // Descriptive context (not scored)
  if (silenceElevated) parts.push('government silence detected (source health indicator)');
  if (structuralElevated) parts.push('structural anomaly detected (descriptive only)');
  if (thematicElevated) {
    parts.push('thematic drift detected (descriptive only)');
  }

  if (parts.length === 0) return 'All layers within baseline ranges';
  return parts.join('; ');
}
