import type { ConvergenceStatus } from '@/lib/types/structural';

/** Short tooltip text for ConvergenceStatusPill title attributes. */
export const CONVERGENCE_TOOLTIPS: Record<ConvergenceStatus, string> = {
  Stable: 'No assessment layers elevated',
  Elevated: 'One assessment layer shows significant deviation',
  Divergent: 'Two or more layers elevated without high AI concern rate',
  ConfirmedConcern: 'Two or more layers elevated with high AI concern rate',
};

/** Longer inline explanation text for ConvergenceHeader. */
export const CONVERGENCE_EXPLANATIONS: Record<ConvergenceStatus, string> = {
  Stable: 'No detection layers are elevated. Patterns are within normal baseline range.',
  Elevated: 'One detection layer shows anomalous activity. Monitoring increased.',
  Divergent: 'Multiple detection layers independently flag anomalies in this category.',
  ConfirmedConcern:
    'Multiple layers elevated with high AI concern rate. Warrants close examination.',
};

/** Descriptions of what each assessment layer measures, appended to indicator dot tooltips. */
export const LAYER_DESCRIPTIONS = [
  'Detects anomalies in document volume, composition, and timing patterns',
  'AI two-pass review flags documents with erosion-relevant characteristics',
  'Tracks topic distribution shifts over rolling 8-week window',
] as const;
