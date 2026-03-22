import type {
  AIAssessmentSummary,
  ConcernAssessment,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

type FlatValue = string | number | null;

interface WeeklyAggregateRow {
  id: number;
  category: string;
  weekOf: string;
  totalSeverity: number;
  documentCount: number;
  avgSeverityPerDoc: number;
  captureProportion: number;
  driftProportion: number;
  warningProportion: number;
  severityMix: number;
  captureMatchCount: number;
  driftMatchCount: number;
  warningMatchCount: number;
  suppressedMatchCount: number;
  topKeywords: string[] | null;
  structuralScore: number | null;
  structuralDetail: unknown;
  thematicScore: number | null;
  thematicDetail: unknown;
  convergenceScore: number | null;
  convergenceDetail: unknown;
  aiScore: number | null;
  aiDetail: unknown;
  computedAt: string | Date;
}

interface DocumentScoreRow {
  id: number;
  documentId: number | null;
  url: string;
  category: string;
  severityScore: number;
  finalScore: number;
  captureCount: number;
  driftCount: number;
  warningCount: number;
  suppressedCount: number;
  documentClass: string;
  classMultiplier: number;
  isHighAuthority: boolean;
  matches: unknown[];
  suppressed: unknown[];
  scoredAt: string | Date;
  weekOf: string;
}

interface MatchEntry {
  keyword?: string;
  [key: string]: unknown;
}

function flattenStructural(s: StructuralScore | null): Record<string, FlatValue> {
  return {
    structural_composite: s?.composite ?? '',
    structural_volume: s?.dimensions?.volume?.zScore ?? '',
    structural_typeComposition: s?.dimensions?.typeComposition?.zScore ?? '',
    structural_functionalDistribution: s?.dimensions?.functionalDistribution?.zScore ?? '',
    structural_agencyActivity: s?.dimensions?.agencyActivity?.zScore ?? '',
    structural_publicationTempo: s?.dimensions?.publicationTempo?.zScore ?? '',
    structural_sourceConvergence: s?.dimensions?.sourceConvergence?.zScore ?? '',
    structural_anomalous: s ? (s.anomalous ? 1 : 0) : '',
    structural_driftTrend: s?.longHorizon?.driftTrend ?? '',
  };
}

function flattenAi(ai: AIAssessmentSummary | null): Record<string, FlatValue> {
  return {
    ai_flagCount: ai?.flagCount ?? '',
    ai_totalDocuments: ai?.totalDocuments ?? '',
    ai_flagRate: ai?.flagRate ?? '',
    ai_concernRate: ai?.concernRate ?? '',
    ai_p2_routine: ai?.concernDistribution?.routine ?? '',
    ai_p2_novelNotConcerning: ai?.concernDistribution?.novelNotConcerning ?? '',
    ai_p2_potentiallyConcerning: ai?.concernDistribution?.potentiallyConcerning ?? '',
    ai_p2_clearlyConcerning: ai?.concernDistribution?.clearlyConcerning ?? '',
    ai_auditFalseNegativeRate: ai?.auditSample?.falseNegativeRate ?? '',
  };
}

function flattenThematic(t: ThematicDriftScore | null): Record<string, FlatValue> {
  return {
    thematic_centroidDistance: t?.rollingCentroidDistance ?? '',
    thematic_zScore: t?.zScore ?? '',
    thematic_novelDocRate: t?.novelDocumentRate ?? '',
    thematic_varianceRatio: t?.varianceRatio ?? '',
    thematic_crossAdminDistance: t?.crossAdminDistance ?? '',
  };
}

function flattenConcern(c: ConcernAssessment | null): Record<string, FlatValue> {
  return {
    concern_status: c?.status ?? '',
    concern_pattern: c?.pattern ?? '',
    concern_structuralElevated: c ? (c.structuralElevated ? 1 : 0) : '',
    concern_aiElevated: c ? (c.aiElevated ? 1 : 0) : '',
    concern_silenceElevated: c ? (c.silenceElevated ? 1 : 0) : '',
    concern_thematicElevated: c ? (c.thematicElevated ? 1 : 0) : '',
  };
}

function toISOString(val: string | Date): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

/** Flatten a weekly_aggregates row for CSV export — jsonb columns become individual fields. */
export function flattenWeeklyRow(row: WeeklyAggregateRow): Record<string, FlatValue> {
  return {
    id: row.id,
    category: row.category,
    weekOf: row.weekOf,
    totalSeverity: row.totalSeverity,
    documentCount: row.documentCount,
    avgSeverityPerDoc: row.avgSeverityPerDoc,
    captureProportion: row.captureProportion,
    driftProportion: row.driftProportion,
    warningProportion: row.warningProportion,
    severityMix: row.severityMix,
    captureMatchCount: row.captureMatchCount,
    driftMatchCount: row.driftMatchCount,
    warningMatchCount: row.warningMatchCount,
    suppressedMatchCount: row.suppressedMatchCount,
    topKeywords: row.topKeywords ? row.topKeywords.join(', ') : '',
    structuralScore: row.structuralScore,
    ...flattenStructural(row.structuralDetail as StructuralScore | null),
    aiScore: row.aiScore,
    ...flattenAi(row.aiDetail as AIAssessmentSummary | null),
    thematicScore: row.thematicScore,
    ...flattenThematic(row.thematicDetail as ThematicDriftScore | null),
    convergenceScore: row.convergenceScore,
    ...flattenConcern(row.convergenceDetail as ConcernAssessment | null),
    computedAt: toISOString(row.computedAt),
  };
}

/** Flatten a document_scores row for CSV export — matches/suppressed arrays become counts + keyword lists. */
export function flattenScoresRow(
  row: DocumentScoreRow,
): Record<string, string | number | boolean | null> {
  const matches = row.matches as MatchEntry[];
  const suppressed = row.suppressed as MatchEntry[];

  return {
    id: row.id,
    documentId: row.documentId,
    url: row.url,
    category: row.category,
    severityScore: row.severityScore,
    finalScore: row.finalScore,
    captureCount: row.captureCount,
    driftCount: row.driftCount,
    warningCount: row.warningCount,
    suppressedCount: row.suppressedCount,
    documentClass: row.documentClass,
    classMultiplier: row.classMultiplier,
    isHighAuthority: row.isHighAuthority,
    matches_count: matches.length,
    matches_keywords: matches
      .map((m) => m.keyword ?? '')
      .filter(Boolean)
      .join(', '),
    suppressed_count: suppressed.length,
    suppressed_keywords: suppressed
      .map((m) => m.keyword ?? '')
      .filter(Boolean)
      .join(', '),
    scoredAt: toISOString(row.scoredAt),
    weekOf: row.weekOf,
  };
}
