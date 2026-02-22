/**
 * Administration-specific keyword overlays with date-filtered merge.
 *
 * These keywords are specific to a particular administration and should not
 * appear in core assessment-rules.ts (which must produce meaningful results
 * against all baselines). The overlay is merged at runtime, filtered by
 * document publication date.
 */

import { ASSESSMENT_RULES } from './assessment-rules';

export interface AdminKeywordOverlay {
  /** Administration identifier (e.g., 'trump_2'). */
  administration: string;
  /** ISO date string — overlay applies to documents on or after this date. */
  applicableFrom: string;
  /** ISO date string — overlay applies to documents on or before this date. Absent = still active. */
  applicableTo?: string;
  /** Keywords keyed by category, then tier. */
  keywords: Record<string, { warning?: string[]; drift?: string[]; capture?: string[] }>;
}

export const ADMIN_OVERLAYS: AdminKeywordOverlay[] = [
  {
    administration: 'schedule_f_era',
    applicableFrom: '2020-10-21',
    keywords: {
      civilService: {
        capture: ['schedule f', 'excepted schedule f', 'mass reclassification to schedule f'],
      },
    },
  },
  {
    administration: 'trump_2',
    applicableFrom: '2025-01-20',
    keywords: {
      civilService: {
        warning: ['doge', 'department of government efficiency', 'fork in the road'],
      },
      fiscal: {
        warning: ['doge spending review'],
      },
    },
  },
];

type KeywordTier = 'capture' | 'drift' | 'warning';

/**
 * Returns the effective keyword list for a category and tier, merging
 * core assessment rules with any applicable admin overlays filtered by date.
 *
 * When no documentDate is provided, only core keywords are returned
 * (safe for baseline assessment where admin terms should not apply).
 */
export function getEffectiveKeywords(
  category: string,
  tier: KeywordTier,
  documentDate?: string,
): string[] {
  const rules = ASSESSMENT_RULES[category];
  const core: string[] = rules?.keywords?.[tier] ?? [];

  if (!documentDate) return core;

  const extras = ADMIN_OVERLAYS.filter(
    (o) => documentDate >= o.applicableFrom && (!o.applicableTo || documentDate <= o.applicableTo),
  ).flatMap((o) => o.keywords[category]?.[tier] ?? []);

  if (extras.length === 0) return core;
  return [...core, ...extras];
}
