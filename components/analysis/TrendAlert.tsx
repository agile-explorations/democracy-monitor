import React from 'react';
import type { TrendAnomaly } from '@/lib/types/trends';

interface TrendAlertProps {
  anomalies: TrendAnomaly[];
}

const SEVERITY_STYLES = {
  low: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
  medium: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800' },
  high: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
};

export function TrendAlert({ anomalies }: TrendAlertProps) {
  if (anomalies.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-slate-800">Trend Anomalies</h4>
      {anomalies.map((anomaly, i) => {
        const style = SEVERITY_STYLES[anomaly.severity];
        return (
          <div
            key={i}
            className={`${style.bg} ${style.border} border rounded px-2 py-1.5 text-xs ${style.text}`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold">{anomaly.ratio.toFixed(1)}x</span>
              <span>{anomaly.message}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
