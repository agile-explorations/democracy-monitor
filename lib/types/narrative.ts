import type {
  AIAssessmentSummary,
  ConvergenceSynthesis,
  StructuralScore,
  ThematicDriftScore,
} from './structural';

/** Narrative audience version identifier. */
export type NarrativeVersion = 'expert' | 'public';

/** A top-concerning document from Pass 2 AI assessment, used to ground narrative generation. */
export interface NarrativeDocumentContext {
  title: string;
  sourceType: string;
  sourceOrigin: string | null;
  agency: string | null;
  assessment: string;
  erosionType: string | null;
  reasoning: string | null;
}

/** Layer data extracted from a weekly_aggregates row, used as input for narrative generation. */
export interface NarrativeLayerData {
  category: string;
  categoryTitle: string;
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

/** Overview-level data for cross-category narrative generation. */
export interface OverviewNarrativeInput {
  weekOf: string;
  categories: NarrativeLayerData[];
  recentWeeksCount?: number;
}
