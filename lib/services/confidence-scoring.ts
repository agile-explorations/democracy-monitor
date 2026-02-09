import {
  AUTHORITY_COUNT_MAX,
  DATA_COVERAGE_WEIGHTS,
  EVIDENCE_COUNT_MAX,
  KEYWORD_DENSITY_RATIO,
  SOURCE_DIVERSITY_MAX,
} from '@/lib/methodology/scoring-config';
import type { AssessmentResult, ContentItem } from '@/lib/types';
import { roundTo } from '@/lib/utils/math';

interface ConfidenceFactors {
  sourceDiversity: number; // 0-1: how many different source types
  authorityWeight: number; // 0-1: presence of authoritative sources
  evidenceCoverage: number; // 0-1: how many items were analyzed
  keywordDensity: number; // 0-1: match density relative to items
  aiAgreement: number; // 0-1: keyword/AI agreement (1 if same, 0.5 if adjacent, 0 if far)
}

const HIGH_AUTHORITY_SOURCES = ['gao', 'court', 'inspector general', 'supreme court', 'judicial'];

/** Minimum keyword density denominator to avoid inflated ratios. */
const MIN_KEYWORD_DENOMINATOR = 3;
/** Default AI agreement score when no AI assessment is available. */
const DEFAULT_AI_AGREEMENT = 0.5;
/** AI agreement scores by distance between keyword and AI status levels. */
const AI_AGREEMENT_BY_DISTANCE = [1, 0.7, 0.4, 0.2] as const;

export function calculateDataCoverage(
  items: ContentItem[],
  keywordResult: AssessmentResult,
  aiStatus?: string,
): { confidence: number; factors: ConfidenceFactors } {
  const validItems = items.filter((i) => !i.isError && !i.isWarning);

  // Source diversity: how many different source types / agencies
  const agencies = new Set(validItems.map((i) => i.agency).filter(Boolean));
  const sourceTypes = new Set(items.map((i) => i.type || 'unknown'));
  const sourceDiversity = Math.min(1, (agencies.size + sourceTypes.size) / SOURCE_DIVERSITY_MAX);

  // Authority weight: presence of authoritative sources
  const authoritativeCount = validItems.filter((item) => {
    const text = `${item.title || ''} ${item.agency || ''}`.toLowerCase();
    return HIGH_AUTHORITY_SOURCES.some((src) => text.includes(src));
  }).length;
  const authorityWeight = Math.min(1, authoritativeCount / AUTHORITY_COUNT_MAX);

  // Evidence coverage: items analyzed relative to a reasonable threshold
  const evidenceCoverage = Math.min(1, validItems.length / EVIDENCE_COUNT_MAX);

  // Keyword density: matches relative to items
  const matchCount = keywordResult.matches.length;
  const keywordDensity =
    validItems.length > 0
      ? Math.min(
          1,
          matchCount / Math.max(MIN_KEYWORD_DENOMINATOR, validItems.length * KEYWORD_DENSITY_RATIO),
        )
      : 0;

  // AI agreement
  let aiAgreement = DEFAULT_AI_AGREEMENT;
  if (aiStatus) {
    const levels = ['Stable', 'Warning', 'Drift', 'Capture'];
    const kwIdx = levels.indexOf(keywordResult.status);
    const aiIdx = levels.indexOf(aiStatus);
    const distance = Math.abs(kwIdx - aiIdx);
    aiAgreement = AI_AGREEMENT_BY_DISTANCE[distance] ?? AI_AGREEMENT_BY_DISTANCE[3];
  }

  const factors: ConfidenceFactors = {
    sourceDiversity,
    authorityWeight,
    evidenceCoverage,
    keywordDensity,
    aiAgreement,
  };

  // Weighted average
  const confidence =
    factors.sourceDiversity * DATA_COVERAGE_WEIGHTS.sourceDiversity +
    factors.authorityWeight * DATA_COVERAGE_WEIGHTS.authorityWeight +
    factors.evidenceCoverage * DATA_COVERAGE_WEIGHTS.evidenceCoverage +
    factors.keywordDensity * DATA_COVERAGE_WEIGHTS.keywordDensity +
    factors.aiAgreement * DATA_COVERAGE_WEIGHTS.aiAgreement;

  return { confidence: roundTo(confidence, 2), factors };
}
