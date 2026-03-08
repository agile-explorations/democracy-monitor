import type { NarrativeLayerData, NarrativeResult } from '@/lib/types';
import type { ConvergenceStatus } from '@/lib/types/structural';

const ELEVATED_STATUSES = new Set<ConvergenceStatus>(['Elevated', 'Divergent', 'ConfirmedConcern']);

/** Returns true if the convergence status warrants AI narrative generation. */
export function isElevatedStatus(detail: NarrativeLayerData['convergenceDetail']): boolean {
  if (!detail) return false;
  return ELEVATED_STATUSES.has(detail.status);
}

/** Generate a stable-category template narrative (no AI call). */
export function buildStableTemplate(categoryTitle: string, weekOf: string): NarrativeResult {
  const template =
    `No significant structural, AI, or thematic anomalies detected for ${categoryTitle} ` +
    `during the week of ${weekOf}. All three detection layers report within baseline parameters.`;
  return { expert: template, public: template, model: 'template' };
}
