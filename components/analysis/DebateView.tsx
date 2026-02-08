import { Markdown } from '@/components/ui/Markdown';
import { useDevMode } from '@/lib/hooks/useDevMode';
import type { DebateResult } from '@/lib/types/debate';

interface DebateViewProps {
  debate: DebateResult;
}

const ROLE_STYLES = {
  prosecutor: { bg: 'bg-red-50', border: 'border-red-200', label: 'Prosecutor', icon: '\u2696' },
  defense: { bg: 'bg-blue-50', border: 'border-blue-200', label: 'Defense', icon: '\u{1F6E1}' },
  arbitrator: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    label: 'Arbitrator',
    icon: '\u2696',
  },
};

export function DebateView({ debate }: DebateViewProps) {
  const [devMode] = useDevMode();

  const verdictColor =
    debate.verdict.verdict === 'concerning'
      ? 'text-red-700'
      : debate.verdict.verdict === 'reassuring'
        ? 'text-green-700'
        : 'text-yellow-700';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">Multi-Agent Debate</h4>
        <span className="text-xs text-slate-500">
          {debate.totalRounds} rounds
          {devMode && <> | {(debate.totalLatencyMs / 1000).toFixed(1)}s</>}
        </span>
      </div>

      {/* Verdict summary */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-sm font-semibold ${verdictColor}`}>
            Verdict:{' '}
            {debate.verdict.verdict.charAt(0).toUpperCase() + debate.verdict.verdict.slice(1)}
          </span>
          <span className="text-xs text-slate-500">
            (Agreement Level: {debate.verdict.agreementLevel}/10)
          </span>
        </div>
        <p className="text-xs text-slate-700">{debate.verdict.summary}</p>
        {debate.verdict.keyPoints.length > 0 && (
          <ul className="mt-2 space-y-1">
            {debate.verdict.keyPoints.map((point, i) => (
              <li key={i} className="text-xs text-slate-600">
                {'•'} {point}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Debate transcript */}
      <div className="space-y-2">
        {debate.messages.map((msg, i) => {
          const style = ROLE_STYLES[msg.role];
          return (
            <div key={i} className={`${style.bg} ${style.border} border rounded p-2`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">
                  {style.icon} {style.label}
                </span>
                <span className="text-[10px] text-slate-500">
                  Round {msg.round}
                  {devMode && (
                    <>
                      {' '}
                      | {msg.provider} ({msg.model}) | {msg.latencyMs}ms
                    </>
                  )}
                </span>
              </div>
              {msg.role === 'arbitrator' ? (
                <p className="text-xs text-slate-500 italic">See verdict above</p>
              ) : (
                <Markdown content={msg.content} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
