import type { DebateResult } from '@/lib/types/debate';
import type { LegalAnalysisResult } from '@/lib/types/legal';
import type { TrendAnomaly } from '@/lib/types/trends';

export interface AutoStatus {
  level: string;
  reason: string;
  auto: boolean;
  matches?: string[];
  assessedAt?: string;
  detail?: {
    captureCount: number;
    driftCount: number;
    warningCount: number;
    itemsReviewed: number;
    hasAuthoritative: boolean;
    insufficientData?: boolean;
  };
}

export interface EnhancedData {
  dataCoverage: number;
  evidenceFor: Array<{
    text: string;
    direction: 'concerning' | 'reassuring';
    source?: string;
  }>;
  evidenceAgainst: Array<{
    text: string;
    direction: 'concerning' | 'reassuring';
    source?: string;
  }>;
  howWeCouldBeWrong: string[];
  aiResult?: {
    provider: string;
    model: string;
    status: string;
    reasoning: string;
    confidence: number;
    latencyMs: number;
  };
  consensusNote?: string;
  debate?: DebateResult;
  legalAnalysis?: LegalAnalysisResult;
  trendAnomalies?: TrendAnomaly[];
}
