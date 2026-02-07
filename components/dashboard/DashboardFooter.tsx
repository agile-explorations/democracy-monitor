import React from 'react';

function fmtDate(d?: Date | string | number) {
  if (!d) return '\u2014';
  const dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return dt.toLocaleString();
}

interface DashboardFooterProps {
  lastTick: number;
}

export function DashboardFooter({ lastTick }: DashboardFooterProps) {
  return (
    <footer className="text-xs text-slate-500 pt-4 pb-8">
      <p>
        <strong>How this works:</strong> This website reads official government documents and looks
        for warning signs. The colors (green/yellow/orange/red) are decided automatically by
        searching for specific words and phrases. Last updated:{' '}
        <span className="text-slate-700">{fmtDate(lastTick)}</span>.
      </p>
      <p className="mt-2">
        <strong>About the data:</strong> All information comes directly from government websites.
        Click any link to see the original source.
      </p>
    </footer>
  );
}
