/**
 * Content-based category classification for CREC documents.
 *
 * Routes Congressional Record speeches to relevant monitoring categories
 * by matching speech text against ASSESSMENT_RULES keywords.
 */

import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';

/**
 * Classify a CREC document into zero or more monitoring categories.
 *
 * Uses the same keyword-matching approach as `classifyLegislativeRelevance()`
 * in legislative-fetcher.ts: concatenates title + text, matches against all
 * category keyword pools (capture + drift + warning).
 *
 * @returns Array of matched category keys (may be empty for procedural content)
 */
export function classifyCrecToCategories(title: string, text?: string | null): string[] {
  const searchText = `${title} ${text || ''}`.toLowerCase();
  const matched = new Set<string>();

  for (const [category, rules] of Object.entries(ASSESSMENT_RULES)) {
    const allKeywords = [
      ...rules.keywords.capture,
      ...rules.keywords.drift,
      ...rules.keywords.warning,
    ];
    for (const kw of allKeywords) {
      if (searchText.includes(kw.toLowerCase())) {
        matched.add(category);
        break;
      }
    }
  }

  return Array.from(matched);
}
