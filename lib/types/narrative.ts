import type {
  AIAssessmentSummary,
  ConvergenceSynthesis,
  StructuralScore,
  ThematicDriftScore,
} from './structural';

/** Category key for weekly cross-category summary narratives. */
export const OVERVIEW_CATEGORY = '_overview';

/** Category key for incremental term summary narratives. */
export const TERM_SUMMARY_CATEGORY = '_term_summary';

/** Narrative version identifier — includes editorial artifacts. */
export type NarrativeVersion = 'expert' | 'public' | 'expert_draft' | 'public_draft' | 'feedback';

/** A top-concerning document from Pass 2 AI assessment, used to ground narrative generation. */
export interface NarrativeDocumentContext {
  title: string;
  sourceType: string;
  sourceOrigin: string | null;
  agency: string | null;
  publishedAt: string | null;
  url: string;
  assessment: string;
  erosionType: string | null;
  reasoning: string | null;
  content: string | null;
}

/** A P1-flagged but P2-routine document — metadata only. */
export interface NarrativeFlaggedDocContext {
  title: string;
  sourceType: string;
  publishedAt: string | null;
}

/** Source-type breakdown for a category-week. */
export interface SourceTypeBreakdown {
  sourceType: string;
  count: number;
}

/** Baseline context for narrative generation. */
export interface NarrativeBaselineContext {
  avgDocsPerWeek: number;
  avgP2ConcernRate: number;
  structuralScoreRange: string;
}

/** Trajectory context: where this category has been. */
export interface NarrativeTrajectory {
  previousWeekStatus: string | null;
  consecutiveWeeksAtStatus: number;
}

/** Layer data extracted from a weekly_aggregates row, used as input for narrative generation. */
export interface NarrativeLayerData {
  category: string;
  categoryTitle: string;
  categoryDescription: string;
  weekOf: string;
  structuralScore: number | null;
  structuralDetail: StructuralScore | null;
  aiScore: number | null;
  aiDetail: AIAssessmentSummary | null;
  thematicScore: number | null;
  thematicDetail: ThematicDriftScore | null;
  convergenceScore: number | null;
  convergenceDetail: ConvergenceSynthesis | null;
  documentContext?: NarrativeDocumentContext[];
  flaggedRoutineContext?: NarrativeFlaggedDocContext[];
  sourceTypeBreakdown?: SourceTypeBreakdown[];
  baselineContext?: NarrativeBaselineContext;
  trajectory?: NarrativeTrajectory;
  totalDocumentCount?: number;
}

/** Result of multi-pass narrative generation for a single category-week. */
export interface MultiPassNarrativeResult {
  expertDraft: string;
  publicDraft: string;
  feedback: string;
  expert: string;
  public: string;
  draftModel: string;
  feedbackModel: string;
  finalModel: string;
}

/** Result of narrative generation for a single category-week. */
export interface NarrativeResult {
  expert: string;
  public: string;
  model: string;
}

/** Stored narrative record from the database. */
export interface StoredNarrative {
  id: number;
  category: string;
  weekOf: string;
  version: NarrativeVersion;
  content: string;
  model: string;
  generatedAt: string;
}

/** Full editorial record for transparency. */
export interface EditorialRecord {
  expert: string | null;
  public: string | null;
  expertDraft: string | null;
  publicDraft: string | null;
  feedback: string | null;
}

/** Recorded narrative generation failure. */
export interface NarrativeFailure {
  id: number;
  category: string;
  weekOf: string;
  failedPass: number;
  error: string;
  attempts: number;
  createdAt: string;
  resolvedAt: string | null;
}

/** Weekly summary input — cross-category synthesis. */
export interface WeeklySummaryInput {
  weekOf: string;
  categories: NarrativeLayerData[];
  categoryNarratives: Map<string, { expert: string; public: string }>;
  failedCategories: string[];
  previousWeekSummary: { expert: string; public: string } | null;
}

/** Term summary input — incremental update. */
export interface TermSummaryInput {
  weekOf: string;
  weeklySummary: { expert: string; public: string };
  previousTermSummary: { expert: string; public: string } | null;
  trajectoryTable: Array<{ category: string; weekOf: string; status: string }>;
  statistics: TermStatistics;
}

/** Key statistics for the term summary. */
export interface TermStatistics {
  weeksPerStatus: Array<{
    category: string;
    stable: number;
    elevated: number;
    divergent: number;
    confirmedConcern: number;
  }>;
  peakConvergenceWeek: string | null;
  currentTrend: Array<{ category: string; direction: 'improving' | 'stable' | 'worsening' }>;
}
