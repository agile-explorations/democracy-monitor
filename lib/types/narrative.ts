import type {
  AIAssessmentSummary,
  ConcernAssessment,
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
  /** WHO performs the erosion-relevant action (#537); null pre-attribution. */
  erosionActor: string | null;
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
  /** Previous week's document count — grounds week-over-week volume claims (#700). */
  previousWeekDocCount: number | null;
  consecutiveWeeksAtStatus: number;
}

/** Per-source fetch health for a category-week. */
export interface NarrativeSourceHealth {
  sourceOrigin: string;
  status: string;
  itemsFetched: number;
  errors: string[] | null;
}

/** Document reference for thematic drift grounding. */
export interface NarrativeThematicDocRef {
  title: string;
  sourceType: string;
  publishedAt: string | null;
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
  convergenceDetail: ConcernAssessment | null;
  documentContext?: NarrativeDocumentContext[];
  flaggedRoutineContext?: NarrativeFlaggedDocContext[];
  sourceTypeBreakdown?: SourceTypeBreakdown[];
  baselineContext?: NarrativeBaselineContext;
  trajectory?: NarrativeTrajectory;
  totalDocumentCount?: number;
  sourceHealthContext?: NarrativeSourceHealth[];
  typicalDocuments?: NarrativeThematicDocRef[];
  driftDrivingDocuments?: NarrativeThematicDocRef[];
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
  draftModel: string | null;
  feedbackModel: string | null;
  finalModel: string | null;
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
  /**
   * Previous week's document total recomputed from current aggregates at
   * generation time. Authoritative over any figure quoted inside the
   * previous-week summary text, which reflects the data as of ITS generation
   * and goes stale when late documents arrive (#700).
   */
  previousWeekTotalDocs: number | null;
  /** Previous week's Elevated-or-above and ConfirmedConcern counts, recomputed
   *  from current aggregates (#700): the only sanctioned source for "up from
   *  N last week" — never the previous-week summary prose. */
  previousWeekElevatedCount?: number | null;
  previousWeekConfirmedCount?: number | null;
}

/** A notable week grounding the term summary (deterministically ranked). */
export interface TermSignificantWeek {
  weekOf: string;
  reasons: string[];
  excerpt: string | null;
}

/** Term summary input — living whole-term synthesis (non-cumulative). */
export interface TermSummaryInput {
  weekOf: string;
  weeklySummary: { expert: string; public: string };
  significantWeeks: TermSignificantWeek[];
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
  /** Distinct substantive documents ingested this term — grounds the summary's
   *  corpus-size claim so the model never estimates it (2026-07-25). */
  termDocumentCount: number;
}
