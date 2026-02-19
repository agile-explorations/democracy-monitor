import {
  AUTHORITY_COUNT_MAX,
  CRITICAL_CONFIDENCE_CAP,
  DATA_COVERAGE_WEIGHTS,
  EVIDENCE_COUNT_MAX,
  KEYWORD_DENSITY_RATIO,
  SOURCE_DIVERSITY_MAX,
} from '@/lib/methodology/scoring-config';
import type { AssessmentResult, ContentItem } from '@/lib/types';
import { roundTo } from '@/lib/utils/math';
import type { SourceHealthSummary } from './source-health-service';

export interface ConfidenceFactors {
  sourceDiversity: number;
  authorityWeight: number;
  evidenceCoverage: number;
  keywordDensity: number;
  aiAgreement: number;
  sourceAvailability: number;
}

const HIGH_AUTHORITY_SOURCES = ['gao', 'court', 'inspector general', 'supreme court', 'judicial'];

/** Minimum keyword density denominator to avoid inflated ratios. */
const MIN_KEYWORD_DENOMINATOR = 3;
/** Default AI agreement score when no AI assessment is available. */
const DEFAULT_AI_AGREEMENT = 0.5;
/** AI agreement scores by distance between keyword and AI status levels. */
const AI_AGREEMENT_BY_DISTANCE = [1, 0.7, 0.4, 0.2] as const;

/** Compute AI agreement factor from keyword and AI status distance. */
export function computeAiAgreement(keywordStatus: string, aiStatus?: string): number {
  if (!aiStatus) return DEFAULT_AI_AGREEMENT;
  const levels = ['Stable', 'Warning', 'Drift', 'Capture'];
  const distance = Math.abs(levels.indexOf(keywordStatus) - levels.indexOf(aiStatus));
  return AI_AGREEMENT_BY_DISTANCE[distance] ?? AI_AGREEMENT_BY_DISTANCE[3];
}

/** Weighted sum of factors, capped if source health is critical. */
export function computeWeightedConfidence(
  factors: ConfidenceFactors,
  sourceHealth?: SourceHealthSummary,
): number {
  const w = DATA_COVERAGE_WEIGHTS;
  let confidence =
    factors.sourceDiversity * w.sourceDiversity +
    factors.authorityWeight * w.authorityWeight +
    factors.evidenceCoverage * w.evidenceCoverage +
    factors.keywordDensity * w.keywordDensity +
    factors.aiAgreement * w.aiAgreement +
    factors.sourceAvailability * w.sourceAvailability;

  if (sourceHealth?.overallHealth === 'critical') {
    confidence = Math.min(CRITICAL_CONFIDENCE_CAP, confidence);
  }
  return roundTo(confidence, 2);
}

export function calculateDataCoverage(
  items: ContentItem[],
  keywordResult: AssessmentResult,
  aiStatus?: string,
  sourceHealth?: SourceHealthSummary,
): { confidence: number; factors: ConfidenceFactors } {
  const validItems = items.filter((i) => !i.isError && !i.isWarning);

  const agencies = new Set(validItems.map((i) => i.agency).filter(Boolean));
  const sourceTypes = new Set(items.map((i) => i.type || 'unknown'));
  const sourceDiversity = Math.min(1, (agencies.size + sourceTypes.size) / SOURCE_DIVERSITY_MAX);

  const authoritativeCount = validItems.filter((item) => {
    const text = `${item.title || ''} ${item.agency || ''}`.toLowerCase();
    return HIGH_AUTHORITY_SOURCES.some((src) => text.includes(src));
  }).length;
  const authorityWeight = Math.min(1, authoritativeCount / AUTHORITY_COUNT_MAX);

  const evidenceCoverage = Math.min(1, validItems.length / EVIDENCE_COUNT_MAX);

  const matchCount = keywordResult.matches.length;
  const keywordDensity =
    validItems.length > 0
      ? Math.min(
          1,
          matchCount / Math.max(MIN_KEYWORD_DENOMINATOR, validItems.length * KEYWORD_DENSITY_RATIO),
        )
      : 0;

  const factors: ConfidenceFactors = {
    sourceDiversity,
    authorityWeight,
    evidenceCoverage,
    keywordDensity,
    aiAgreement: computeAiAgreement(keywordResult.status, aiStatus),
    sourceAvailability: sourceHealth?.dataAvailabilityScore ?? 1,
  };

  return { confidence: computeWeightedConfidence(factors, sourceHealth), factors };
}
