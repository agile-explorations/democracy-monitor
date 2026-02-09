export type ValidationSource = 'v-dem' | 'freedom-house' | 'bright-line-watch';

export const VALIDATION_SOURCES: ValidationSource[] = [
  'v-dem',
  'freedom-house',
  'bright-line-watch',
];

export interface ValidationDataPoint {
  source: ValidationSource;
  date: string;
  dimension: string;
  score: number; // normalized 0-1
  rawScore?: number;
  notes?: string;
}

export interface ValidationComparison {
  source: ValidationSource;
  dimension: string;
  externalScore: number;
  internalCategory: string;
  internalStatus: string;
  alignment: 'aligned' | 'divergent' | 'insufficient_data';
  lastUpdated: string;
}

export interface ValidationSummary {
  sources: Array<{
    name: ValidationSource;
    lastUpdated: string;
    dataPointCount: number;
  }>;
  comparisons: ValidationComparison[];
  overallAlignment: number; // 0-1 fraction of aligned comparisons
}
