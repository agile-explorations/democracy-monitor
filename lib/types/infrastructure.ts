export type InfrastructureTheme =
  | 'detention_incarceration'
  | 'surveillance_apparatus'
  | 'criminalization_opposition';

export type ConvergenceLevel = 'none' | 'emerging' | 'convergent';

export interface InfrastructureKeywordMatch {
  keyword: string;
  source: string;
  category: string;
}

export interface InfrastructureThemeResult {
  theme: InfrastructureTheme;
  label: string;
  description: string;
  active: boolean;
  matchCount: number;
  matches: InfrastructureKeywordMatch[];
  categoriesInvolved: string[];
  suppressedCount?: number;
}

export interface InfrastructureAssessment {
  themes: InfrastructureThemeResult[];
  activeThemeCount: number;
  convergence: ConvergenceLevel;
  convergenceNote: string;
  scannedCategories: number;
  totalItemsScanned: number;
  assessedAt: string;
}
