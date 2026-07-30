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
