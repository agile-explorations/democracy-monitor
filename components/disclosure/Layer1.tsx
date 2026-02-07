import React from 'react';
import type { StatusLevel } from '@/lib/types';
import { StatusPill } from '@/components/ui/StatusPill';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';

interface Layer1Props {
  level: StatusLevel;
  dataCoverage?: number;
  reason: string;
}

export function Layer1({ level, dataCoverage, reason }: Layer1Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <StatusPill level={level} />
      {dataCoverage !== undefined && (
        <div className="w-24">
          <ConfidenceBar confidence={dataCoverage} />
        </div>
      )}
      {reason && (
        <p className="text-xs text-slate-600 flex-1">{reason}</p>
      )}
    </div>
  );
}
