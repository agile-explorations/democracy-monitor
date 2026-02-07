import React from 'react';
import type { StatusLevel } from '@/lib/types';

const COLORS: Record<StatusLevel, string> = {
  Stable: 'bg-green-100 text-green-800 border-green-200',
  Warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Drift: 'bg-orange-100 text-orange-800 border-orange-200',
  Capture: 'bg-red-100 text-red-800 border-red-200',
};

export function StatusPill({ level }: { level: StatusLevel }) {
  return (
    <span className={`px-2 py-1 rounded-full border text-xs font-medium ${COLORS[level]}`}>
      {level}
    </span>
  );
}
