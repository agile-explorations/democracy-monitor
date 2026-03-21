import type { ConvergenceStatus } from '@/lib/types/structural';

/** Short tooltip text for ConvergenceStatusPill title attributes. */
export const CONVERGENCE_TOOLTIPS: Record<ConvergenceStatus, string> = {
  Stable: 'No active detection layers elevated',
  Elevated: 'One active detection layer shows significant deviation',
  Divergent: 'Two active detection layers elevated without high AI concern rate',
  ConfirmedConcern: 'Two active detection layers elevated with high AI concern rate',
};

/** Longer inline explanation text for ConvergenceHeader. */
export const CONVERGENCE_EXPLANATIONS: Record<ConvergenceStatus, string> = {
  Stable: 'No active detection layers are elevated. Patterns are within normal baseline range.',
  Elevated: 'One active detection layer shows anomalous activity. Monitoring increased.',
  Divergent: 'Both active detection layers (AI content + silence) independently flag anomalies.',
  ConfirmedConcern:
    'Both active layers elevated with high AI concern rate. Warrants close examination.',
};

/**
 * Descriptions of what each indicator dot measures.
 * L1 structural and L3 thematic are descriptive context only — they do not drive convergence status.
 * Active detection layers: L2 (AI content assessment) + L1v2 (silence detection, not shown as dot).
 */
export const LAYER_DESCRIPTIONS = [
  'Structural context (descriptive only — does not drive status)',
  'AI two-pass review — active detection layer that drives convergence status',
  'Thematic drift context (descriptive only — does not drive status)',
] as const;
