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

/**
 * Plain-language derivation of each weekly status from Pass 2 document counts —
 * the actual calculation, shown in the methodology page's Concern Synthesis
 * section. Single source of truth for the threshold copy so the numbers don't
 * drift across the places they appear. Divergent is a retired status and has no
 * live threshold.
 */
export const CONCERN_LEVEL_THRESHOLDS: Record<Exclude<ConcernLevel, 'Divergent'>, string> = {
  Stable: '0 clearly-concerning documents and at most 1 potentially-concerning',
  Elevated: '≥1 clearly-concerning, or ≥2 potentially-concerning documents',
  ConfirmedConcern: '≥2 clearly-concerning, or ≥3 concerning documents with a >20% concern rate',
};
