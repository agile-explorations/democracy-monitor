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
 * Synthesize convergence status from L2 (AI) + L1v2 (silence detection).
 *
 * Status determination:
 *   Stable           — all layers within baseline ranges
 *   Elevated         — one layer showing significant deviation
 *   Divergent        — two or more layers deviating
 *   ConfirmedConcern — two or more layers deviating AND high AI concern rate
 *
 * Active detection layers:
 *   L2  — AI two-pass content assessment (primary detection)
 *   L1v2 — silence detection (government quiet + independent active)
 *
 * Descriptive context only (not scored):
 *   L1  — structural anomaly (preserved for narrative metadata)
 *   L3  — thematic drift (preserved for narrative/research visualization)
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

  const layersElevated = countElevatedLayers(aiElevated, silenceElevated);
  const highConcern = isHighConcern(aiAssessment);
  const status = determineStatus(layersElevated, highConcern);
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
 * L2 (AI content assessment) + L1v2 (silence detection) = max 2.
 * L1 structural and L3 thematic are descriptive only.
 */
function countElevatedLayers(aiElevated: boolean, silenceElevated: boolean): number {
  let count = 0;
  if (aiElevated) count++;
  if (silenceElevated) count++;
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
  silenceElevated: boolean,
  thematicElevated: boolean,
): string {
  const parts: string[] = [];

  // Active detection layers
  if (aiElevated) parts.push('AI flag rate elevated');
  if (silenceElevated) parts.push('conspicuous government silence detected');

  // Descriptive context (not scored)
  if (structuralElevated) parts.push('structural anomaly detected (descriptive only)');
  if (thematicElevated) {
    parts.push('thematic drift detected (descriptive only, not scored)');
  }

  if (parts.length === 0) return 'All layers within baseline ranges';
  return parts.join('; ');
}
