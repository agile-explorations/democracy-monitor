import type { AssessmentResult } from './assessment';
import type { StatusLevel } from './categories';
import type { DebateResult } from './debate';
import type { LegalAnalysisResult } from './legal';
import type { TrendAnomaly } from './trends';

export interface EvidenceItem {
  text: string;
  direction: 'concerning' | 'reassuring';
  source?: string;
}

export interface KeywordMatchContext {
  keyword: string;
  tier: 'capture' | 'drift' | 'warning';
  matchedIn: string;
}

export interface EnhancedAssessment {
  category: string;
  status: StatusLevel;
  reason: string;
  matches: string[];
  dataCoverage: number;
  dataCoverageFactors?: Record<string, number>;
  evidenceFor: EvidenceItem[];
  evidenceAgainst: EvidenceItem[];
  howWeCouldBeWrong: string[];
  keywordResult: AssessmentResult;
  aiResult?: {
    provider: string;
    model: string;
    status: StatusLevel;
    reasoning: string;
    confidence: number;
    tokensUsed: { input: number; output: number };
    latencyMs: number;
  };
  consensusNote?: string;
  assessedAt: string;
  // Skeptic review fields
  recommendedStatus?: StatusLevel;
  downgradeApplied?: boolean;
  flaggedForReview?: boolean;
  keywordReview?: Array<{
    keyword: string;
    assessment: string;
    reasoning: string;
    suggestedAction?: string;
    suppressionContext?: string;
  }>;
  whatWouldChangeMind?: string;
  // Source documents reviewed during assessment
  reviewedDocuments?: Array<{ title: string; url?: string; date?: string }>;
  // Deep analysis (populated by snapshot cron for Drift/Capture)
  debate?: DebateResult;
  legalAnalysis?: LegalAnalysisResult;
  trendAnomalies?: TrendAnomaly[];
}
