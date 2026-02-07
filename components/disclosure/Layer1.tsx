import React from 'react';
import type { StatusLevel } from '@/lib/types';
import { StatusPill } from '@/components/ui/StatusPill';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';

interface Layer1Props {
  level: StatusLevel;
  confidence?: number;
  reason: string;
}

export function Layer1({ level, confidence, reason }: Layer1Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <StatusPill level={level} />
      {confidence !== undefined && (
        <div className="w-24">
          <ConfidenceBar confidence={confidence} />
        </div>
      )}
      {reason && (
        <p className="text-xs text-slate-600 flex-1">{reason}</p>
      )}
    </div>
  );
}
