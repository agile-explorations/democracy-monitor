import React, { useEffect, useState } from 'react';
import { DebateView } from '@/components/analysis/DebateView';
import { LegalAnalysisView } from '@/components/analysis/LegalAnalysis';
import { TrendAlert } from '@/components/analysis/TrendAlert';
import type { StatusLevel } from '@/lib/types';
import type { DebateResult } from '@/lib/types/debate';
import type { LegalAnalysisResult } from '@/lib/types/legal';
import type { TrendAnomaly } from '@/lib/types/trends';

interface Layer4Props {
  categoryKey: string;
  level: StatusLevel;
  evidence: string[];
}

export function Layer4({ categoryKey, level, evidence }: Layer4Props) {
  const [debate, setDebate] = useState<DebateResult | null>(null);
  const [legal, setLegal] = useState<LegalAnalysisResult | null>(null);
  const [anomalies, setAnomalies] = useState<TrendAnomaly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDeepAnalysis = async () => {
      setLoading(true);

      const body = JSON.stringify({ category: categoryKey, status: level, evidence });
      const headers = { 'Content-Type': 'application/json' };

      const results = await Promise.allSettled([
        fetch('/api/ai/debate', { method: 'POST', headers, body }).then((r) => r.json()),
        fetch('/api/ai/legal-analysis', { method: 'POST', headers, body }).then((r) => r.json()),
        fetch('/api/ai/trends', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            category: categoryKey,
            items: evidence.map((e) => ({ title: e })),
          }),
        }).then((r) => r.json()),
      ]);

      if (results[0].status === 'fulfilled' && !results[0].value.skipped) {
        setDebate(results[0].value);
      }
      if (results[1].status === 'fulfilled' && !results[1].value.skipped) {
        setLegal(results[1].value);
      }
      if (results[2].status === 'fulfilled' && results[2].value.anomalies) {
        setAnomalies(results[2].value.anomalies);
      }

      setLoading(false);
    };
    loadDeepAnalysis();
  }, [categoryKey, level, evidence]);

  if (loading) {
    return (
      <div className="text-xs text-purple-600 italic py-4 text-center">
        Loading deep analysis (debate, legal, trends)...
      </div>
    );
  }

  const hasContent = debate || legal || anomalies.length > 0;

  if (!hasContent) {
    return (
      <div className="text-xs text-slate-400 italic py-4 text-center">
        Deep analysis requires AI providers (OpenAI + Anthropic) to be configured.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {anomalies.length > 0 && <TrendAlert anomalies={anomalies} />}
      {debate && <DebateView debate={debate} />}
      {legal && <LegalAnalysisView analysis={legal} />}
    </div>
  );
}
