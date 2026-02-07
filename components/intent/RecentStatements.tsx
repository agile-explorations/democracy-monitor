import React from 'react';
import type { IntentStatement } from '@/lib/types/intent';

interface RecentStatementsProps {
  statements: IntentStatement[];
}

const TIER_LABELS: Record<number, string> = {
  1: 'Official',
  2: 'Major Media',
  3: 'Other',
};

export function RecentStatements({ statements }: RecentStatementsProps) {
  if (statements.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-slate-900">Recent Statements & Actions</h4>
      <ul className="space-y-1.5 text-xs">
        {statements.slice(0, 10).map((stmt, idx) => {
          const typeColor = stmt.type === 'action' ? 'text-blue-600 bg-blue-50' : 'text-purple-600 bg-purple-50';
          const scoreColor = stmt.score > 0.5 ? 'text-red-600' : stmt.score < -0.5 ? 'text-green-600' : 'text-slate-500';

          return (
            <li key={idx} className="flex items-start gap-2">
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${typeColor}`}>
                {stmt.type === 'action' ? 'ACT' : 'RHT'}
              </span>
              <div className="flex-1">
                {stmt.url ? (
                  <a href={stmt.url} target="_blank" rel="noreferrer" className="text-slate-800 hover:underline">
                    {stmt.text}
                  </a>
                ) : (
                  <span className="text-slate-800">{stmt.text}</span>
                )}
                <div className="flex gap-2 mt-0.5 text-slate-400">
                  <span>{stmt.source} ({TIER_LABELS[stmt.sourceTier]})</span>
                  <span>{stmt.date}</span>
                  <span className={scoreColor}>Score: {stmt.score.toFixed(1)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
