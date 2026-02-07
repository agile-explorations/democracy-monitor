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
    refreshMs >= WEEK ? 'Weekly' :
    refreshMs >= DAY ? `${Math.round(refreshMs / DAY)} day(s)` :
    refreshMs >= HOUR ? `${Math.round(refreshMs / HOUR)} hour(s)` :
    `${Math.round(refreshMs / MIN)} min`;

  return (
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Is Democracy Working?</h1>
        <p className="text-sm text-slate-600 mt-1">This dashboard checks if the government is following the rules. It looks at official documents from courts, watchdogs, and government agencies to see if power is being used properly.</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-xs text-slate-500">Updates: <span className="font-medium text-slate-700">{humanRefresh}</span></div>
        <select value={refreshMs} onChange={(e) => setRefreshMs(parseInt(e.target.value))} className="text-sm border rounded px-2 py-1 bg-white">
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
