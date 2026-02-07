import React from 'react';
import type { UptimeHistory } from '@/lib/types/resilience';

interface UptimeIndicatorProps {
  site: UptimeHistory;
  compact?: boolean;
}

export function UptimeIndicator({ site, compact }: UptimeIndicatorProps) {
  const isUp = site.current.isUp;
  const dotColor = isUp ? 'bg-green-500' : 'bg-red-500';
  const dotPulse = isUp ? '' : 'animate-pulse';

  if (compact) {
    return (
      <span
        className={`inline-block w-2 h-2 rounded-full ${dotColor} ${dotPulse}`}
        title={`${site.name}: ${isUp ? 'Up' : 'Down'} (${site.uptime24h.toFixed(0)}% 24h)`}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor} ${dotPulse}`} />
      <span className="text-slate-700 font-medium">{site.name}</span>
      {!isUp && site.downSince && (
        <span className="text-red-600">
          Down since {new Date(site.downSince).toLocaleDateString()}
        </span>
      )}
      {isUp && <span className="text-slate-500">{site.uptime24h.toFixed(0)}% (24h)</span>}
      {site.current.responseTimeMs !== null && isUp && (
        <span className="text-slate-400">{site.current.responseTimeMs}ms</span>
      )}
    </div>
  );
}
