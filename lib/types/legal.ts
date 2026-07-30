export interface LegalCitation {
  title: string;
  citation: string;
  type: string;
  relevance: string;
  verified: boolean;
}

export interface LegalAnalysisResult {
  category: string;
  status: string;
  citations: LegalCitation[];
  analysis: string;
  constitutionalConcerns: string[];
  precedents: string[];
  provider: string;
  model: string;
  latencyMs: number;
}
