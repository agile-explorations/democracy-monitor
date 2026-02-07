import React from 'react';

interface GovernanceScoreBarProps {
  score: number; // -2 to +2
  label?: string;
}

export function GovernanceScoreBar({ score, label }: GovernanceScoreBarProps) {
  // Normalize score from [-2, 2] to [0, 100]
  const pct = Math.round(((score + 2) / 4) * 100);

  return (
    <div className="space-y-1">
      {label && <span className="text-xs text-slate-500">{label}</span>}
      <div className="relative h-3 bg-gradient-to-r from-green-200 via-yellow-200 to-red-200 rounded-full overflow-hidden">
        <div
          className="absolute top-0 w-2.5 h-3 bg-slate-800 rounded-full border-2 border-white shadow"
          style={{ left: `calc(${pct}% - 5px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>Democracy</span>
        <span>Authoritarian</span>
      </div>
    </div>
  );
}
