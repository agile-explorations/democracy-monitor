import type { ConcernLevel } from '@/lib/types/structural';

/** Short tooltip text for ConcernLevelPill title attributes. */
export const CONCERN_LEVEL_TOOLTIPS: Record<ConcernLevel, string> = {
  Stable: 'AI content assessment within baseline range',
  Elevated: 'AI content assessment elevated with P2 corroboration',
  Divergent: 'AI content assessment elevated (legacy status)',
  ConfirmedConcern: 'AI content assessment elevated with high P2 concern rate',
};

/** Longer inline explanation text for ConcernHeader. */
export const CONCERN_LEVEL_EXPLANATIONS: Record<ConcernLevel, string> = {
  Stable: 'AI content assessment is within normal baseline range. No concerns detected.',
  Elevated:
    'AI two-pass review flags anomalous content with P2 corroboration. Monitoring increased.',
  Divergent: 'AI content assessment elevated (legacy status from prior detection model).',
  ConfirmedConcern:
    'AI content assessment elevated with high P2 concern rate. Warrants close examination.',
};
