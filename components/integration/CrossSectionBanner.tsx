import React from 'react';
import type { StatusLevel } from '@/lib/types';
import type { IntentAssessment } from '@/lib/types/intent';

interface CrossSectionBannerProps {
  intentAssessment: IntentAssessment | null;
  statusMap: Record<string, string>;
}

export function CrossSectionBanner({ intentAssessment, statusMap }: CrossSectionBannerProps) {
  if (!intentAssessment) return null;

  const statuses = Object.values(statusMap) as StatusLevel[];
  const driftCount = statuses.filter((s) => s === 'Drift').length;
  const captureCount = statuses.filter((s) => s === 'Capture').length;

  const intentLevel = intentAssessment.overall;
  const isIntentConcerning = [
    'competitive_authoritarian',
    'closed_authoritarian',
    'personalist_rule',
  ].includes(intentLevel);
  const isSystemDrifting = driftCount >= 2 || captureCount >= 1;

  // Only show banner when there's divergence or convergence worth noting
  if (!isIntentConcerning && !isSystemDrifting) return null;

  const isConvergent = isIntentConcerning && isSystemDrifting;
  const isDivergent = isIntentConcerning !== isSystemDrifting;

  const bannerColor = isConvergent
    ? 'bg-red-50 border-red-300 text-red-800'
    : isDivergent
      ? 'bg-amber-50 border-amber-300 text-amber-800'
      : 'bg-blue-50 border-blue-300 text-blue-800';

  let message: string;
  if (isConvergent) {
    message = `Alert: Both administration intent (${intentLevel.replace(/_/g, ' ')}) and institutional health (${captureCount} captured, ${driftCount} drifting) are concerning. This convergence suggests accelerated institutional degradation.`;
  } else if (isIntentConcerning && !isSystemDrifting) {
    message = `Intent-drift gap: Administration intent classified as ${intentLevel.replace(/_/g, ' ')}, but institutions are largely holding. Institutions may be serving as effective checks.`;
  } else {
    message = `System stress: ${captureCount + driftCount} categories showing concern despite moderate intent signals. Institutional resilience may be weakening independent of stated intent.`;
  }

  return (
    <div className={`border rounded-lg p-3 ${bannerColor}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none">{isConvergent ? '\u26A0' : '\u2139'}</span>
        <div>
          <p className="text-sm font-semibold mb-0.5">
            {isConvergent ? 'Cross-Section Alert' : 'Cross-Section Analysis'}
          </p>
          <p className="text-xs">{message}</p>
        </div>
      </div>
    </div>
  );
}
