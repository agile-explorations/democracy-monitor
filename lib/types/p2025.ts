import type { PolicyArea } from './intent';

export interface P2025Proposal {
  id: string;
  chapter: string;
  targetAgency: string | null;
  dashboardCategory: string | null;
  policyArea: PolicyArea | null;
  severity: 'low' | 'medium' | 'high' | 'extreme';
  text: string;
  summary: string;
  status: 'not_started' | 'in_progress' | 'implemented' | 'exceeded' | 'abandoned';
}

export type P2025Classification = 'not_related' | 'loosely_related' | 'implements' | 'exceeds';

export interface P2025Match {
  proposalId: string;
  documentId: number | null;
  cosineSimilarity: number;
  llmClassification: P2025Classification | null;
  llmConfidence: number | null;
  llmReasoning: string | null;
  humanReviewed: boolean;
}

export interface P2025Summary {
  totalProposals: number;
  matchedCount: number;
  classificationBreakdown: Record<P2025Classification, number>;
  byCategory: Record<string, { total: number; matched: number }>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
}
