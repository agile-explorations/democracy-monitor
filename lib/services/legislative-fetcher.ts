/**
 * Legislative classification — routes bills and congressional items to dashboard categories.
 *
 * Used by legiscan-fetcher.ts for bill classification. The GovInfo CREC fetch
 * was removed (data is fetched through snapshotCrec instead).
 */

import { classifyCrecToCategories } from '@/lib/services/crec-classifier';

/** Search terms for executive power oversight in congressional records. */
export const OVERSIGHT_SEARCH_TERMS = [
  'inspector general',
  'executive order',
  'subpoena',
  'oversight hearing',
  'confirmation vote',
  'appropriations hold',
  'impoundment',
  'contempt of congress',
  'executive privilege',
  'whistleblower',
  'government accountability',
  'presidential authority',
];

/**
 * Classify a legislative item's relevance to dashboard categories
 * using topic-routing terms (shared with CREC classification).
 */
export function classifyLegislativeRelevance(title: string, summary?: string): string[] {
  return classifyCrecToCategories(title, summary);
}
