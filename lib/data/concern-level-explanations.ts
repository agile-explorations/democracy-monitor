import type { ConcernLevel } from '@/lib/types/structural';

/**
 * Witness-stance display vocabulary for weekly statuses (#732): the ladder
 * measures DEPARTURE from documented baseline practice, not danger. Stored
 * status values (Stable/Elevated/Divergent/ConfirmedConcern) are unchanged —
 * this file is the single mapping layer for every surface that renders them.
 */
export const CONCERN_LEVEL_LABELS: Record<ConcernLevel, string> = {
  Stable: 'Consistent with baseline',
  Elevated: 'Notable departure',
  Divergent: 'Departure (legacy)',
  ConfirmedConcern: 'Sustained departure',
};

/** Short tooltip text for ConcernLevelPill title attributes. */
export const CONCERN_LEVEL_TOOLTIPS: Record<ConcernLevel, string> = {
  Stable: 'Document review consistent with the baseline range',
  Elevated: 'Document review shows departures, corroborated by the second-pass review',
  Divergent: 'Departure flagged by a prior detection model (legacy status)',
  ConfirmedConcern:
    'Document review shows a sustained, high rate of clear-departure documents — warrants close examination',
};

/** Longer inline explanation text for ConcernHeader. */
export const CONCERN_LEVEL_EXPLANATIONS: Record<ConcernLevel, string> = {
  Stable:
    'Document review is consistent with the baseline range. No departures from documented practice detected this week.',
  Elevated:
    'The two-pass document review flags departures from baseline practice, corroborated by the second pass. Monitoring increased.',
  Divergent: 'Departure flagged by a prior detection model (legacy status, no longer produced).',
  ConfirmedConcern:
    'Document review shows a sustained, high rate of clear-departure documents. Warrants close examination of the underlying record.',
};

/**
 * Plain-language derivation of each weekly status from Pass 2 document counts —
 * the actual calculation, shown in the methodology page's status synthesis
 * section. Single source of truth for the threshold copy so the numbers don't
 * drift across the places they appear. Divergent is a retired status and has no
 * live threshold.
 */
export const CONCERN_LEVEL_THRESHOLDS: Record<Exclude<ConcernLevel, 'Divergent'>, string> = {
  Stable: '0 clear-departure documents and at most 1 possible-departure',
  Elevated: '≥1 clear-departure, or ≥2 possible-departure documents',
  ConfirmedConcern: '≥2 clear-departure, or ≥3 departure documents with a >20% departure rate',
};

/** Count-aware strip label (#732): "3 Notable departures" but "1 Sustained
 *  departure"; labels without a countable noun are returned unchanged. */
export function concernLevelCountLabel(status: ConcernLevel, count: number): string {
  const label = CONCERN_LEVEL_LABELS[status];
  return count === 1 ? label : label.replace(/\bdeparture\b/, 'departures');
}
