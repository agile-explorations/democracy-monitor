import type {
  AIAssessmentSummary,
  ConvergenceSynthesis,
  StructuralScore,
  ThematicDriftScore,
} from './structural';

/** Three-layer data from the latest weekly_aggregates row for a category. */
export interface CategoryDetailLatestWeek {
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
