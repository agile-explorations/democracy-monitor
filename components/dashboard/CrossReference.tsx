import React from 'react';
import type { CrossReference as CrossReferenceType } from '@/lib/types/intent';

interface CrossReferenceProps {
  crossRef: CrossReferenceType | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'text-green-700 bg-green-50 border-green-200',
  medium: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  high: 'text-orange-700 bg-orange-50 border-orange-200',
  critical: 'text-red-700 bg-red-50 border-red-200',
};

export function CrossReference({ crossRef }: CrossReferenceProps) {
  if (!crossRef) return null;

  return (
    <div className={`mt-2 px-2 py-1.5 rounded border text-xs ${SEVERITY_COLORS[crossRef.severity]}`}>
      <span className="font-medium">Intent + Drift:</span> {crossRef.interpretation}
    </div>
  );
}
