export interface KeywordTrend {
  keyword: string;
  category: string;
  currentCount: number;
  baselineAvg: number;
  ratio: number; // currentCount / baselineAvg
  isAnomaly: boolean;
  periodStart: string;
  periodEnd: string;
}

export interface TrendAnomaly {
  keyword: string;
  category: string;
  ratio: number;
  severity: 'low' | 'medium' | 'high';
  message: string;
  detectedAt: string;
}

export interface SemanticCluster {
  id: number;
  label: string;
  description: string;
  documentCount: number;
  topKeywords: string[];
  categories: string[];
  centroid?: number[];
  createdAt: string;
}

export interface DigestEntry {
  date: string;
  summary: string;
  summaryExpert?: string;
  highlights: string[];
  categorySummaries: Record<string, string>;
  categorySummariesExpert?: Record<string, string>;
  anomalies: TrendAnomaly[];
  overallAssessment: string;
  provider: string;
  model: string;
  createdAt: string;
}
