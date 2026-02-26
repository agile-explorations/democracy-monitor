import type {
  AIAssessmentSummary,
  ConvergenceSynthesis,
  StructuralScore,
  ThematicDriftScore,
} from './structural';

/** Narrative audience version identifier. */
export type NarrativeVersion = 'expert' | 'public';

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
