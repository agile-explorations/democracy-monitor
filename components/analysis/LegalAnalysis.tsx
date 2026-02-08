import { Markdown } from '@/components/ui/Markdown';
import { useDevMode } from '@/lib/hooks/useDevMode';
import type { LegalAnalysisResult } from '@/lib/types/legal';

interface LegalAnalysisProps {
  analysis: LegalAnalysisResult;
}

export function LegalAnalysisView({ analysis }: LegalAnalysisProps) {
  const [devMode] = useDevMode();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">Legal Analysis</h4>
        <span className="text-xs text-slate-500">
          {devMode ? (
            <>
              {analysis.provider} ({analysis.model}) | {analysis.latencyMs}ms
            </>
          ) : (
            'AI-assisted'
          )}
        </span>
      </div>

      <Markdown content={analysis.analysis} />

      {analysis.citations.length > 0 && (
        <div className="mt-2">
          <h5 className="text-xs font-semibold text-slate-800 mb-1">Legal Citations</h5>
          <div className="space-y-1.5">
            {analysis.citations.map((citation, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-0.5 ${citation.verified ? 'text-green-600' : 'text-yellow-600'}`}
                >
                  {citation.verified ? '\u2713' : '?'}
                </span>
                <div>
                  <span className="font-medium">{citation.title}</span>
                  <span className="text-slate-500 ml-1">({citation.citation})</span>
                  {citation.relevance && (
                    <p className="text-slate-600 mt-0.5">{citation.relevance}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.constitutionalConcerns.length > 0 && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
          <h5 className="text-xs font-semibold text-red-800 mb-1">Constitutional Concerns</h5>
          <ul className="space-y-0.5">
            {analysis.constitutionalConcerns.map((concern, i) => (
              <li key={i} className="text-xs text-red-700">
                {'•'} {concern}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.precedents.length > 0 && (
        <div className="mt-2">
          <h5 className="text-xs font-semibold text-slate-800 mb-1">Relevant Precedents</h5>
          <ul className="space-y-0.5">
            {analysis.precedents.map((precedent, i) => (
              <li key={i} className="text-xs text-slate-600">
                {'•'} {precedent}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
