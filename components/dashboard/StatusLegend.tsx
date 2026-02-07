import React from 'react';
import { StatusPill } from '@/components/ui/StatusPill';
import { Card } from '@/components/ui/Card';

export function StatusLegend() {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900 mb-3">What Do The Colors Mean?</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        <div className="flex items-start gap-2">
          <StatusPill level="Stable" />
          <span className="text-slate-600">Everything is working normally - courts and watchdogs are doing their jobs</span>
        </div>
        <div className="flex items-start gap-2">
          <StatusPill level="Warning" />
          <span className="text-slate-600">Some problems detected, but institutions are still pushing back</span>
        </div>
        <div className="flex items-start gap-2">
          <StatusPill level="Drift" />
          <span className="text-slate-600">Multiple warning signs - power is becoming more centralized</span>
        </div>
        <div className="flex items-start gap-2">
          <StatusPill level="Capture" />
          <span className="text-slate-600">Serious violations found - the President is ignoring laws or court orders</span>
        </div>
      </div>
    </Card>
  );
}
