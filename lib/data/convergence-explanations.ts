import type { ConvergenceStatus } from '@/lib/types/structural';

/** Short tooltip text for ConvergenceStatusPill title attributes. */
export const CONVERGENCE_TOOLTIPS: Record<ConvergenceStatus, string> = {
  Stable: 'AI content assessment within baseline range',
  Elevated: 'AI content assessment elevated with P2 corroboration',
  Divergent: 'AI content assessment elevated (legacy status)',
  ConfirmedConcern: 'AI content assessment elevated with high P2 concern rate',
};

/** Longer inline explanation text for ConvergenceHeader. */
export const CONVERGENCE_EXPLANATIONS: Record<ConvergenceStatus, string> = {
  Stable: 'AI content assessment is within normal baseline range. No concerns detected.',
  Elevated:
    'AI two-pass review flags anomalous content with P2 corroboration. Monitoring increased.',
  Divergent: 'AI content assessment elevated (legacy status from prior detection model).',
  ConfirmedConcern:
    'AI content assessment elevated with high P2 concern rate. Warrants close examination.',
};

/**
 * Descriptions of what each indicator dot measures.
 * L2 (AI content assessment) is the sole active detection layer driving convergence status.
 * L1 structural, L1v2 silence, and L3 thematic are descriptive context only.
 */
export const LAYER_DESCRIPTIONS = [
  'Structural context (descriptive only — does not drive status)',
  'AI two-pass review — sole active detection layer driving convergence status',
  'Thematic drift context (descriptive only — does not drive status)',
] as const;
