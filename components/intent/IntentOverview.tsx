import React from 'react';
import { ConfidenceBar } from '@/components/ui/ConfidenceBar';
import { GOVERNANCE_FRAMEWORK } from '@/lib/data/governance-framework';
import type { IntentAssessment } from '@/lib/types/intent';
import { GovernanceScoreBar } from './GovernanceScoreBar';

interface IntentOverviewProps {
  assessment: IntentAssessment;
}

export function IntentOverview({ assessment }: IntentOverviewProps) {
  const framework = GOVERNANCE_FRAMEWORK.find((f) => f.key === assessment.overall);

  const labelColor =
    assessment.overall === 'liberal_democracy'
      ? 'text-green-700 bg-green-100 border-green-200'
      : assessment.overall === 'competitive_authoritarian'
        ? 'text-yellow-700 bg-yellow-100 border-yellow-200'
        : assessment.overall === 'executive_dominant'
          ? 'text-orange-700 bg-orange-100 border-orange-200'
          : assessment.overall === 'illiberal_democracy'
            ? 'text-red-700 bg-red-100 border-red-200'
            : 'text-red-900 bg-red-200 border-red-300';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold text-slate-900">Governance Classification</h3>
        <span className={`px-2 py-1 rounded-full border text-xs font-medium ${labelColor}`}>
          {framework?.label || assessment.overall}
        </span>
      </div>
      {framework && <p className="text-sm text-slate-600">{framework.description}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GovernanceScoreBar
          score={(assessment.rhetoricScore + assessment.actionScore) / 2}
          label="Overall Position"
        />
        <ConfidenceBar confidence={assessment.confidence} label="Assessment Confidence" />
      </div>
    </div>
  );
}
