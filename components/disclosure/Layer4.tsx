import { DebateView } from '@/components/analysis/DebateView';
import { LegalAnalysisView } from '@/components/analysis/LegalAnalysis';
import { TrendAlert } from '@/components/analysis/TrendAlert';
import type { DebateResult } from '@/lib/types/debate';
import type { LegalAnalysisResult } from '@/lib/types/legal';
import type { TrendAnomaly } from '@/lib/types/trends';

interface Layer4Props {
  debate?: DebateResult;
  legalAnalysis?: LegalAnalysisResult;
  trendAnomalies?: TrendAnomaly[];
}

export function Layer4({ debate, legalAnalysis, trendAnomalies }: Layer4Props) {
  const anomalies = trendAnomalies || [];
  const hasContent = debate || legalAnalysis || anomalies.length > 0;

  if (!hasContent) {
    return (
      <div className="text-xs text-slate-400 italic py-4 text-center">
        Deep analysis not yet available. It will be included in the next snapshot.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {anomalies.length > 0 && <TrendAlert anomalies={anomalies} />}
      {debate && <DebateView debate={debate} />}
      {legalAnalysis && <LegalAnalysisView analysis={legalAnalysis} />}
    </div>
  );
}
