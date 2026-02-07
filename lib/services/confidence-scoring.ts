import type { AssessmentResult } from '@/lib/types';

interface ConfidenceFactors {
  sourceDiversity: number;     // 0-1: how many different source types
  authorityWeight: number;     // 0-1: presence of authoritative sources
  evidenceCoverage: number;    // 0-1: how many items were analyzed
  keywordDensity: number;      // 0-1: match density relative to items
  aiAgreement: number;         // 0-1: keyword/AI agreement (1 if same, 0.5 if adjacent, 0 if far)
}

const HIGH_AUTHORITY_SOURCES = ['gao', 'court', 'inspector general', 'supreme court', 'judicial'];

export function calculateConfidence(
  items: any[],
  keywordResult: AssessmentResult,
  aiStatus?: string
): { confidence: number; factors: ConfidenceFactors } {
  const validItems = items.filter(i => !i.isError && !i.isWarning);

  // Source diversity: how many different source types / agencies
  const agencies = new Set(validItems.map(i => i.agency).filter(Boolean));
  const sourceTypes = new Set(items.map(i => i.type || 'unknown'));
  const sourceDiversity = Math.min(1, (agencies.size + sourceTypes.size) / 6);

  // Authority weight: presence of authoritative sources
  const authoritativeCount = validItems.filter(item => {
    const text = `${item.title || ''} ${item.agency || ''}`.toLowerCase();
    return HIGH_AUTHORITY_SOURCES.some(src => text.includes(src));
  }).length;
  const authorityWeight = Math.min(1, authoritativeCount / 3);

  // Evidence coverage: items analyzed relative to a reasonable threshold
  const evidenceCoverage = Math.min(1, validItems.length / 10);

  // Keyword density: matches relative to items
  const matchCount = keywordResult.matches.length;
  const keywordDensity = validItems.length > 0
    ? Math.min(1, matchCount / Math.max(3, validItems.length * 0.3))
    : 0;

  // AI agreement
  let aiAgreement = 0.5; // default when no AI
  if (aiStatus) {
    const levels = ['Stable', 'Warning', 'Drift', 'Capture'];
    const kwIdx = levels.indexOf(keywordResult.status);
    const aiIdx = levels.indexOf(aiStatus);
    const distance = Math.abs(kwIdx - aiIdx);
    aiAgreement = distance === 0 ? 1 : distance === 1 ? 0.7 : distance === 2 ? 0.4 : 0.2;
  }

  const factors: ConfidenceFactors = {
    sourceDiversity,
    authorityWeight,
    evidenceCoverage,
    keywordDensity,
    aiAgreement,
  };

  // Weighted average
  const weights = {
    sourceDiversity: 0.15,
    authorityWeight: 0.25,
    evidenceCoverage: 0.2,
    keywordDensity: 0.15,
    aiAgreement: 0.25,
  };

  const confidence =
    factors.sourceDiversity * weights.sourceDiversity +
    factors.authorityWeight * weights.authorityWeight +
    factors.evidenceCoverage * weights.evidenceCoverage +
    factors.keywordDensity * weights.keywordDensity +
    factors.aiAgreement * weights.aiAgreement;

  return { confidence: Math.round(confidence * 100) / 100, factors };
}
