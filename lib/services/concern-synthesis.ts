import {
  AI_CONCERN_MIN_SAMPLE,
  AI_CONCERN_THRESHOLD,
  CC_MIN_ACTION_CONFIRMATIONS,
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
  SilenceDetail,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

/**
 * Synthesize convergence status from L2 (AI content assessment).
 *
 * Status determination (absolute P2 thresholds, no baseline comparison).
 * GRADED EVIDENCE (#842, owner decision 2026-09-02; variant calibrated
 * 2026-09-02 on the full corpus): discussion-tier confirmations count FULLY
 * toward Elevated — a week evidenced only by floor speeches still warrants
 * attention — but the ConfirmedConcern path consumes tier-WEIGHTED counts
 * (action at 1.0, discussion at DISCUSSION_CONFIRMATION_WEIGHT) and requires
 * ≥CC_MIN_ACTION_CONFIRMATIONS action-tier confirmed documents. Discussions
 * about changing norms matter and are counted; the strongest public claim is
 * reserved for weeks anchored by primary instruments. Calibration: the
 * fully-weighted variant Stabled ~510 Elevated weeks and broke known-event
 * detection at every weight; this variant flips only CC→Elevated (395 weeks
 * at w=0.5) with zero known-event violations. Summaries without tier counts
 * (stored pre-graded) keep the original ungraded behavior.
 *   Stable           — P2 found no concerning documents
 *   Elevated         — ≥1 clearly_concerning OR ≥2 potentially_concerning (raw)
 *   ConfirmedConcern — ≥2 clearly_concerning, OR ≥3 concerning with ≥20% rate
 *                      (tier-weighted), AND the action-tier gate
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
  const { status, evidenceMix } = determineGradedStatus(aiElevated, highConcern, aiAssessment);
  const pattern = describePattern(
    structuralElevated,
    aiElevated,
    silenceElevated,
    thematicElevated,
  );

  return {
    status,
    ...(evidenceMix ? { evidenceMix } : {}),
    structuralElevated,
    aiElevated,
    silenceElevated,
    thematicElevated,
    layersElevated,
    pattern,
    bootstrap: isBootstrap,
    silence: silence ? toSilenceDetail(silence) : undefined,
  };
}

/** Persist how silence was assessed (#546) without the full score internals. */
function toSilenceDetail(s: SilenceScore): SilenceDetail {
  return {
    mode: s.mode,
    govDocCount: s.govDocCount,
    independentDocCount: s.independentDocCount,
    rollingGovMean: s.rollingGovMean,
    govSilenceZ: s.govSilenceZ,
    presenceRate: s.presenceRate,
    zeroStreak: s.zeroStreak,
    coverageNote: s.coverageNote,
  };
}

function isStructuralElevated(structural: StructuralScore | null, category?: string): boolean {
  if (!structural) return false;
  const threshold = getStructuralThreshold(category ?? '');
  return structural.composite > threshold;
}

/** CC-path inputs: tier-weighted when the summary is graded (#842),
 *  raw distribution otherwise. Elevated always uses raw counts. */
function ccPathCounts(a: AIAssessmentSummary): {
  potentially: number;
  clearly: number;
} {
  if (a.weightedConcern) {
    return {
      potentially: a.weightedConcern.potentiallyConcerning,
      clearly: a.weightedConcern.clearlyConcerning,
    };
  }
  return {
    potentially: a.concernDistribution.potentiallyConcerning,
    clearly: a.concernDistribution.clearlyConcerning,
  };
}

function isAIElevated(aiAssessment: AIAssessmentSummary | null): boolean {
  if (!aiAssessment) return false;
  const { concernDistribution: d } = aiAssessment;
  // Raw counts by design (#842 variant B): discussion evidence fully counts
  // toward Elevated; only the ConfirmedConcern path is graded.
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
  const c = ccPathCounts(aiAssessment);
  const pass2Count =
    d.routine + d.novelNotConcerning + d.potentiallyConcerning + d.clearlyConcerning;
  if (pass2Count < AI_CONCERN_MIN_SAMPLE) return false;
  // Path 1: multiple clearly_concerning docs alone trigger ConfirmedConcern
  if (c.clearly >= P2_CONFIRMED_MIN_CLEARLY) return true;
  // Path 2: enough concerning docs with high concern rate. The rate keeps its
  // raw denominator (share of assessed docs); the numerator is tier-weighted
  // on graded summaries.
  const concerning = c.potentially + c.clearly;
  const rate =
    aiAssessment.weightedConcern && pass2Count > 0
      ? concerning / pass2Count
      : aiAssessment.concernRate;
  return concerning >= P2_CONFIRMED_MIN_CONCERNING && rate > AI_CONCERN_THRESHOLD;
}

/**
 * Count actively-scored elevated layers.
 * L2 (AI content assessment) is the sole detection layer.
 * Silence, structural, and thematic are descriptive context only.
 */
function countElevatedLayers(aiElevated: boolean): number {
  return aiElevated ? 1 : 0;
}

/** Graded status (#842): the ungraded ladder plus the ConfirmedConcern
 *  action gate. Returns the evidence mix for graded summaries so the UI can
 *  disclose it (#843). */
function determineGradedStatus(
  aiElevated: boolean,
  highConcern: boolean,
  aiAssessment: AIAssessmentSummary | null,
): { status: ConcernLevel; evidenceMix?: ConcernAssessment['evidenceMix'] } {
  const graded =
    aiAssessment?.actionConfirmedCount !== undefined &&
    aiAssessment.discussionConfirmedCount !== undefined;
  let status: ConcernLevel = 'Stable';
  if (aiElevated && highConcern) status = 'ConfirmedConcern';
  else if (aiElevated) status = 'Elevated';

  if (!graded) return { status };

  const actionConfirmed = aiAssessment.actionConfirmedCount as number;
  const ccGateApplied =
    status === 'ConfirmedConcern' && actionConfirmed < CC_MIN_ACTION_CONFIRMATIONS;
  if (ccGateApplied) status = 'Elevated';

  return {
    status,
    evidenceMix: {
      actionConfirmed,
      discussionConfirmed: aiAssessment.discussionConfirmedCount as number,
      ccGateApplied,
    },
  };
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
