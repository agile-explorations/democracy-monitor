import {
  AI_CONCERN_MIN_SAMPLE,
  AI_CONCERN_THRESHOLD,
  AI_FLAG_RATE_MIN_DOCS,
  AI_FLAG_RATE_STRONG_THRESHOLD,
  AI_FLAG_RATE_THRESHOLD,
  getStructuralThreshold,
  THEMATIC_DRIFT_ELEVATED,
} from '@/lib/methodology/scoring-config';
import type { SilenceScore } from '@/lib/services/silence-detection-service';
import { SILENCE_Z_THRESHOLD } from '@/lib/services/silence-detection-service';
import type {
  AIAssessmentSummary,
  ConvergenceStatus,
  ConvergenceSynthesis,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

/**
 * Synthesize convergence status from L2 (AI content assessment).
 *
 * Status determination (L2-only):
 *   Stable           — L2 within baseline range
 *   Elevated         — L2 flag rate elevated with P2 corroboration
 *   ConfirmedConcern — L2 elevated AND high P2 concern rate
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
): ConvergenceSynthesis {
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
  if (aiAssessment.totalDocuments < AI_FLAG_RATE_MIN_DOCS) return false;
  if (aiAssessment.flagRateZScore <= AI_FLAG_RATE_THRESHOLD) return false;
  // P1 flag rate is elevated — require P2 corroboration or very strong flag rate
  return (
    aiAssessment.concernRate > 0 || aiAssessment.flagRateZScore > AI_FLAG_RATE_STRONG_THRESHOLD
  );
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
  return aiAssessment.concernRate > AI_CONCERN_THRESHOLD;
}

/**
 * Count actively-scored elevated layers.
 * L2 (AI content assessment) is the sole detection layer.
 * Silence, structural, and thematic are descriptive context only.
 */
function countElevatedLayers(aiElevated: boolean): number {
  return aiElevated ? 1 : 0;
}

function determineStatus(aiElevated: boolean, highConcern: boolean): ConvergenceStatus {
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
  if (aiElevated) parts.push('AI flag rate elevated');

  // Descriptive context (not scored)
  if (silenceElevated) parts.push('government silence detected (source health indicator)');
  if (structuralElevated) parts.push('structural anomaly detected (descriptive only)');
  if (thematicElevated) {
    parts.push('thematic drift detected (descriptive only)');
  }

  if (parts.length === 0) return 'All layers within baseline ranges';
  return parts.join('; ');
}
