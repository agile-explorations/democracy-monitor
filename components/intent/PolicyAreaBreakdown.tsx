import React from 'react';
import type { PolicyArea } from '@/lib/types/intent';
import { GovernanceScoreBar } from './GovernanceScoreBar';

const POLICY_LABELS: Record<PolicyArea, string> = {
  rule_of_law: 'Rule of Law',
  civil_liberties: 'Civil Liberties',
  elections: 'Elections',
  media_freedom: 'Media Freedom',
  institutional_independence: 'Institutional Independence',
};

interface PolicyAreaBreakdownProps {
  policyAreas: Record<PolicyArea, { rhetoric: number; action: number; gap: number }>;
}

export function PolicyAreaBreakdown({ policyAreas }: PolicyAreaBreakdownProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-900">Policy Area Breakdown</h4>
      <div className="space-y-4">
        {(Object.entries(policyAreas) as [PolicyArea, { rhetoric: number; action: number; gap: number }][]).map(([area, scores]) => (
          <div key={area} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">{POLICY_LABELS[area]}</span>
              {scores.gap > 0.5 && (
                <span className="text-[10px] text-amber-600 font-medium">Gap: {scores.gap.toFixed(1)}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <GovernanceScoreBar score={scores.rhetoric} label="Rhetoric" />
              <GovernanceScoreBar score={scores.action} label="Actions" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
