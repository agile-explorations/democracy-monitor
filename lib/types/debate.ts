export type DebateRole = 'prosecutor' | 'defense' | 'arbitrator';

export interface DebateMessage {
  role: DebateRole;
  provider: string;
  model: string;
  content: string;
  round: number;
  latencyMs: number;
}

export interface DebateVerdict {
  agreementLevel: number; // 1-10
  verdict: 'concerning' | 'mixed' | 'reassuring';
  summary: string;
  keyPoints: string[];
}

export interface DebateResult {
  category: string;
  status: string;
  messages: DebateMessage[];
  verdict: DebateVerdict;
  totalRounds: number;
  startedAt: string;
  completedAt: string;
  totalLatencyMs: number;
}
