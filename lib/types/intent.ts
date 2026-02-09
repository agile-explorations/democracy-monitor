import type { StatusLevel } from './categories';

export type GovernanceCategory =
  | 'liberal_democracy'
  | 'competitive_authoritarian'
  | 'executive_dominant'
  | 'illiberal_democracy'
  | 'personalist_rule';

export interface GovernanceFrameworkEntry {
  key: GovernanceCategory;
  label: string;
  description: string;
  indicators: string[];
  scoreRange: [number, number]; // min, max on -2 to +2 scale
}

export type PolicyArea =
  | 'rule_of_law'
  | 'civil_liberties'
  | 'elections'
  | 'media_freedom'
  | 'institutional_independence';

export const POLICY_AREAS: PolicyArea[] = [
  'rule_of_law',
  'civil_liberties',
  'elections',
  'media_freedom',
  'institutional_independence',
];

export interface IntentScore {
  rhetoric: number; // -2 to +2 (-2 = strong democratic, +2 = strong authoritarian)
  action: number; // -2 to +2
  gap: number; // absolute difference between rhetoric and action
}

export interface IntentStatement {
  text: string;
  source: string;
  sourceTier: 1 | 2 | 3; // 1 = official (WH), 2 = major media, 3 = social/other
  type: 'rhetoric' | 'action';
  policyArea: PolicyArea;
  score: number; // -2 to +2
  date: string;
  url?: string;
}

export interface IntentAssessment {
  overall: GovernanceCategory;
  confidence: number;
  rhetoricScore: number;
  actionScore: number;
  gap: number;
  policyAreas: Record<PolicyArea, IntentScore>;
  recentStatements: IntentStatement[];
  assessedAt: string;
  aiReasoning?: string;
  aiOverall?: GovernanceCategory;
  aiProvider?: string;
  aiModel?: string;
  consensusNote?: string;
}

export interface CrossReference {
  intentCategory: GovernanceCategory;
  institutionalStatus: StatusLevel;
  interpretation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface LagAnalysisResult {
  policyArea: PolicyArea;
  maxCorrelation: number;
  lagWeeks: number;
  interpretation: string;
  correlationByLag: Array<{ lag: number; correlation: number }>;
  dataPoints: number;
}
