import { useEffect, useState } from 'react';
import type { WeekExplanation, DocumentExplanation } from '@/lib/types/explanation';

interface Layer5Props {
  categoryKey: string;
}

function TierBar({
  label,
  proportion,
  color,
}: {
  label: string;
  proportion: number;
  color: string;
}) {
  const pct = Math.round(proportion * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-slate-600">{label}</span>
      <div className="flex-1 bg-slate-100 rounded h-2">
        <div className={`${color} rounded h-2`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-slate-500">{pct}%</span>
    </div>
  );
}

function DocumentDetail({ doc, expanded }: { doc: DocumentExplanation; expanded: boolean }) {
  if (!expanded) return null;

  return (
    <div className="mt-1 pl-4 border-l-2 border-slate-200 space-y-1 text-xs">
      <p className="text-slate-500">
        Class: <span className="font-mono">{doc.documentClass}</span> (x{doc.classMultiplier})
      </p>
      <div className="space-y-0.5">
        {doc.tierBreakdown
          .filter((t) => t.count > 0)
          .map((t) => (
            <p key={t.tier} className="text-slate-600">
              {t.tier}: {t.count} match{t.count !== 1 ? 'es' : ''} x{t.weight} ={' '}
              {t.contribution.toFixed(2)}
            </p>
          ))}
      </div>
      <p className="font-mono text-slate-400 break-all">{doc.formula}</p>
      {doc.matches.length > 0 && (
        <div className="mt-1">
          <p className="font-semibold text-slate-600">Keyword matches:</p>
          {doc.matches.map((m, i) => (
            <p key={i} className="text-slate-500 pl-2">
              <span className="font-mono">{m.keyword}</span>{' '}
              <span className="text-slate-400">({m.tier})</span>
              {m.context && (
                <span className="block pl-2 text-slate-400 italic truncate">{m.context}</span>
              )}
            </p>
          ))}
        </div>
      )}
      {doc.suppressed.length > 0 && (
        <div className="mt-1">
          <p className="font-semibold text-slate-600">Suppressed:</p>
          {doc.suppressed.map((s, i) => (
            <p key={i} className="text-slate-400 pl-2">
              <span className="font-mono">{s.keyword}</span> — {s.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layer5({ categoryKey }: Layer5Props) {
  const [data, setData] = useState<WeekExplanation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/explain/week?category=${categoryKey}&top=5`);
        if (!res.ok) {
          if (res.status === 503) {
            setError('Database not configured');
          } else if (res.status === 404) {
            setError('No scoring data available yet');
          } else {
            setError(`Failed to load (${res.status})`);
          }
          return;
        }
        if (cancelled) return;
        const json = await res.json();
        setData(json);
      } catch {
        if (!cancelled) setError('Failed to fetch scoring data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [categoryKey]);

  if (loading) {
    return (
      <div className="text-xs text-slate-400 italic py-4 text-center animate-pulse">
        Loading scoring breakdown...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-xs text-slate-400 italic py-4 text-center">
        {error || 'Scoring data not available'}
      </div>
    );
  }

  const { configSnapshot: config } = data;

  return (
    <div className="space-y-3 text-xs">
      {/* Week summary */}
      <div className="bg-slate-50 border border-slate-200 rounded p-2 space-y-1">
        <p className="font-semibold text-slate-700">
          Week of {data.weekOf} — {data.documentCount} document
          {data.documentCount !== 1 ? 's' : ''}
        </p>
        <p className="text-slate-600">
          Total severity: <span className="font-mono">{data.totalSeverity.toFixed(2)}</span> | Avg
          per doc: <span className="font-mono">{data.avgSeverityPerDoc.toFixed(2)}</span>
        </p>
      </div>

      {/* Tier proportions */}
      <div className="space-y-1">
        <p className="font-semibold text-slate-600">Tier proportions</p>
        <TierBar label="Capture" proportion={data.tierProportions.capture} color="bg-red-400" />
        <TierBar label="Drift" proportion={data.tierProportions.drift} color="bg-orange-400" />
        <TierBar label="Warning" proportion={data.tierProportions.warning} color="bg-yellow-400" />
      </div>

      {/* Top keywords */}
      {data.topKeywords.length > 0 && (
        <div>
          <p className="font-semibold text-slate-600 mb-1">Top keywords</p>
          <div className="flex flex-wrap gap-1">
            {data.topKeywords.map((kw) => (
              <span
                key={kw}
                className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 font-mono"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top documents */}
      {data.topDocuments.length > 0 && (
        <div>
          <p className="font-semibold text-slate-600 mb-1">Top scoring documents</p>
          <div className="space-y-1">
            {data.topDocuments.map((doc) => (
              <div key={doc.url}>
                <button
                  onClick={() => setExpandedDoc(expandedDoc === doc.url ? null : doc.url)}
                  className="w-full text-left flex items-center gap-2 hover:bg-slate-50 rounded px-1 py-0.5"
                >
                  <span className="font-mono text-slate-500 w-12 text-right shrink-0">
                    {doc.finalScore.toFixed(1)}
                  </span>
                  <span className="text-slate-700 truncate">{doc.title}</span>
                  <span className="text-slate-400 ml-auto shrink-0">
                    {expandedDoc === doc.url ? '\u25B2' : '\u25BC'}
                  </span>
                </button>
                <DocumentDetail doc={doc} expanded={expandedDoc === doc.url} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Config snapshot */}
      <details className="text-slate-400">
        <summary className="cursor-pointer hover:text-slate-600">Scoring configuration</summary>
        <div className="mt-1 pl-2 space-y-0.5 font-mono">
          <p>
            Tier weights: capture={config.tierWeights.capture}, drift={config.tierWeights.drift},
            warning={config.tierWeights.warning}
          </p>
          <p>Decay half-life: {config.decayHalfLifeWeeks} weeks</p>
          <p>
            Negation window: {config.negationWindowBefore}ch before, {config.negationWindowAfter}ch
            after
          </p>
        </div>
      </details>
    </div>
  );
}
