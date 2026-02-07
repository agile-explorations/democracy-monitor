import React from 'react';

interface RhetoricActionGapProps {
  rhetoricScore: number;
  actionScore: number;
  gap: number;
  gaps: string[];
}

export function RhetoricActionGap({ rhetoricScore, actionScore, gap, gaps }: RhetoricActionGapProps) {
  const gapSeverity = gap > 1 ? 'text-red-600 bg-red-50' : gap > 0.5 ? 'text-amber-600 bg-amber-50' : 'text-slate-600 bg-slate-50';

  return (
    <div className={`p-3 rounded border text-xs space-y-2 ${gapSeverity}`}>
      <h4 className="font-semibold">Rhetoric vs. Action Gap</h4>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="font-medium">Rhetoric Score:</span> {rhetoricScore.toFixed(1)}
        </div>
        <div>
          <span className="font-medium">Action Score:</span> {actionScore.toFixed(1)}
        </div>
      </div>
      {gap > 0.3 && (
        <div>
          <p className="font-medium mb-1">Gap: {gap.toFixed(1)} {gap > 1 ? '(significant divergence)' : ''}</p>
          {gaps.length > 0 && (
            <ul className="space-y-0.5 ml-2">
              {gaps.map((g, i) => <li key={i}>&bull; {g}</li>)}
            </ul>
          )}
        </div>
      )}
      {gap <= 0.3 && <p>Rhetoric and actions are generally aligned.</p>}
    </div>
  );
}
