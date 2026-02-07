import React from 'react';
import type { StatusLevel } from '@/lib/types';
import { CATEGORIES } from '@/lib/data/categories';
import { StatusPill } from '@/components/ui/StatusPill';

interface SystemHealthOverviewProps {
  statusMap: Record<string, string>;
}

export function SystemHealthOverview({ statusMap }: SystemHealthOverviewProps) {
  const statuses = CATEGORIES.map((cat) => ({
    key: cat.key,
    title: cat.title,
    status: (statusMap[cat.key] || 'Warning') as StatusLevel,
  }));

  const stableCount = statuses.filter((s) => s.status === 'Stable').length;
  const warningCount = statuses.filter((s) => s.status === 'Warning').length;
  const driftCount = statuses.filter((s) => s.status === 'Drift').length;
  const captureCount = statuses.filter((s) => s.status === 'Capture').length;

  const overallHealth =
    captureCount > 0
      ? 'Critical'
      : driftCount >= 3
        ? 'Serious'
        : driftCount > 0
          ? 'Concerning'
          : warningCount > 3
            ? 'Caution'
            : 'Healthy';

  const healthColor = {
    Critical: 'text-red-700',
    Serious: 'text-orange-700',
    Concerning: 'text-yellow-700',
    Caution: 'text-blue-700',
    Healthy: 'text-green-700',
  }[overallHealth];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">System Health Overview</h3>
        <span className={`text-sm font-bold ${healthColor}`}>{overallHealth}</span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
        <div className="bg-green-50 rounded p-1.5">
          <div className="text-lg font-bold text-green-700">{stableCount}</div>
          <div className="text-green-600">Stable</div>
        </div>
        <div className="bg-yellow-50 rounded p-1.5">
          <div className="text-lg font-bold text-yellow-700">{warningCount}</div>
          <div className="text-yellow-600">Warning</div>
        </div>
        <div className="bg-orange-50 rounded p-1.5">
          <div className="text-lg font-bold text-orange-700">{driftCount}</div>
          <div className="text-orange-600">Drift</div>
        </div>
        <div className="bg-red-50 rounded p-1.5">
          <div className="text-lg font-bold text-red-700">{captureCount}</div>
          <div className="text-red-600">Capture</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        {statuses.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs py-0.5">
            <StatusPill level={s.status} />
            <span className="text-slate-600">{s.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
