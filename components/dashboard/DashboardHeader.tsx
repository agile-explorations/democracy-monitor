import React from 'react';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

interface DashboardHeaderProps {
  refreshMs: number;
  setRefreshMs: (ms: number) => void;
}

export function DashboardHeader({ refreshMs, setRefreshMs }: DashboardHeaderProps) {
  const humanRefresh =
    refreshMs >= WEEK
      ? 'Weekly'
      : refreshMs >= DAY
        ? `${Math.round(refreshMs / DAY)} day(s)`
        : refreshMs >= HOUR
          ? `${Math.round(refreshMs / HOUR)} hour(s)`
          : `${Math.round(refreshMs / MIN)} min`;

  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const scenario = process.env.NEXT_PUBLIC_DEMO_SCENARIO || 'mixed';

  return (
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
      {isDemo && (
        <div className="w-full bg-amber-100 border border-amber-300 text-amber-800 text-xs font-medium px-3 py-1.5 rounded mb-2">
          Demo Mode — Showing fixture data (scenario: {scenario}). No external calls.
        </div>
      )}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
          Is Democracy Working?
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          This dashboard checks if the government is following the rules. It looks at official
          documents from courts, watchdogs, and government agencies to see if power is being used
          properly.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-xs text-slate-500">
          Updates: <span className="font-medium text-slate-700">{humanRefresh}</span>
        </div>
        <select
          value={refreshMs}
          onChange={(e) => setRefreshMs(parseInt(e.target.value))}
          className="text-sm border rounded px-2 py-1 bg-white"
        >
          <option value={WEEK}>Weekly</option>
          <option value={DAY}>Daily</option>
          <option value={6 * HOUR}>Every 6 hours</option>
          <option value={HOUR}>Every hour</option>
          <option value={15 * MIN}>Every 15 minutes</option>
        </select>
      </div>
    </header>
  );
}
