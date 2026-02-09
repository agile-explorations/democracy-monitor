export type { SignalType, StatusLevel, Signal, Category } from './categories';
export type {
  ContentItem,
  AssessmentDetail,
  AssessmentResult,
  AssessmentRule,
  AssessmentRules,
} from './assessment';
export type {
  AICompletionOptions,
  AICompletionResult,
  AIEmbeddingResult,
  AIProvider,
  AIEmbeddingProvider,
} from './ai';
export type {
  GovernanceCategory,
  GovernanceFrameworkEntry,
  PolicyArea,
  IntentScore,
  IntentStatement,
  IntentAssessment,
  CrossReference,
  LagAnalysisResult,
} from './intent';
export { POLICY_AREAS } from './intent';
export type { P2025Proposal, P2025Classification, P2025Match, P2025Summary } from './p2025';
export type {
  MonitoredSite,
  UptimeResult,
  UptimeHistory,
  SuppressionAlert,
  ExpectedReport,
  InformationAvailabilityStatus,
} from './resilience';
export type { DebateRole, DebateMessage, DebateVerdict, DebateResult } from './debate';
export type { LegalDocument, LegalCitation, LegalAnalysisResult } from './legal';
export type { KeywordTrend, TrendAnomaly, SemanticCluster, DigestEntry } from './trends';
export type {
  InfrastructureTheme,
  ConvergenceLevel,
  InfrastructureKeywordMatch,
  InfrastructureThemeResult,
  InfrastructureAssessment,
} from './infrastructure';
export type {
  SeverityTier,
  DocumentClass,
  KeywordMatch,
  SuppressedMatch,
  DocumentScore,
} from './scoring';
export type { EvidenceItem, KeywordMatchContext, EnhancedAssessment } from './enhanced-assessment';
export type {
  TierBreakdown,
  DocumentExplanation,
  ConfigSnapshot,
  WeekExplanation,
} from './explanation';
export type {
  LegislativeItemType,
  LegislativeItem,
  LegislativeTrackingSummary,
} from './legislative';
export type {
  ValidationSource,
  ValidationDataPoint,
  ValidationComparison,
  ValidationSummary,
} from './validation';
export { VALIDATION_SOURCES } from './validation';
