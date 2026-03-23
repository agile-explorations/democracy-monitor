/**
 * Topic-level category routing for congressional text (CREC floor speeches,
 * LegiScan bills, GovInfo packages).
 *
 * Routes documents to monitoring categories using broad topic terms,
 * NOT the narrow erosion-detection keywords from ASSESSMENT_RULES.
 * The three-layer pipeline (L1/L2/L3) handles the actual assessment.
 */

import { TOPIC_ROUTING_TERMS } from '@/lib/data/topic-routing-terms';

/** Threshold below which terms get word-boundary matching to avoid substring false positives. */
const WORD_BOUNDARY_THRESHOLD = 5;

/**
 * Build a regex cache for terms that need word-boundary matching.
 * Short terms (e.g., "ICE", "DOJ", "APA", "FBI") would otherwise match
 * as substrings in common words (service, notice, practice, etc.).
 */
const regexCache = new Map<string, RegExp>();

function matchesTerm(searchText: string, term: string): boolean {
  const termLower = term.toLowerCase();
  if (termLower.length >= WORD_BOUNDARY_THRESHOLD) {
    return searchText.includes(termLower);
  }
  // Short terms: use word-boundary regex
  let regex = regexCache.get(termLower);
  if (!regex) {
    regex = new RegExp(`\\b${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    regexCache.set(termLower, regex);
  }
  return regex.test(searchText);
}

/**
 * Route a CREC document to zero or more monitoring categories.
 *
 * Matches speech title + text against CREC_ROUTING_TERMS — broad topic
 * indicators designed to answer "is this speech about this category?"
 * rather than "does this speech contain erosion evidence?"
 *
 * @returns Array of matched category keys (may be empty for off-topic content)
 */
export function classifyCrecToCategories(title: string, text?: string | null): string[] {
  const searchText = `${title} ${text || ''}`.toLowerCase();
  const matched = new Set<string>();

  for (const [category, terms] of Object.entries(TOPIC_ROUTING_TERMS)) {
    for (const term of terms) {
      if (matchesTerm(searchText, term)) {
        matched.add(category);
        break;
      }
    }
  }

  return Array.from(matched);
}
