import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { CounterEvidence } from '@/components/ui/CounterEvidence';
import { EvidenceBalance } from '@/components/ui/EvidenceBalance';

interface EnhancedAssessmentData {
  dataCoverage: number;
  evidenceFor: Array<{ text: string; direction: 'concerning' | 'reassuring'; source?: string }>;
  evidenceAgainst: Array<{ text: string; direction: 'concerning' | 'reassuring'; source?: string }>;
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
}

interface EnhancedAssessmentProps {
  data: EnhancedAssessmentData;
}

export function EnhancedAssessment({ data }: EnhancedAssessmentProps) {
  return (
    <div className="mt-2 space-y-3">
      <ConfidenceBar confidence={data.dataCoverage} label="Data Coverage" />

      {data.consensusNote && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1 italic">
          {data.consensusNote}
        </p>
      )}

      {data.aiResult && (
        <div className="p-2 bg-purple-50 border border-purple-200 rounded text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-purple-800">AI Analysis</span>
            <span className="text-purple-500">
              ({data.aiResult.provider} / {data.aiResult.model})
            </span>
            <span className="text-purple-400 ml-auto">{data.aiResult.latencyMs}ms</span>
          </div>
          <p className="text-purple-700">{data.aiResult.reasoning}</p>
        </div>
      )}

      <EvidenceBalance evidenceFor={data.evidenceFor} evidenceAgainst={data.evidenceAgainst} />

      <CounterEvidence items={data.howWeCouldBeWrong} />
    </div>
  );
}
