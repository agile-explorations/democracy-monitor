/**
 * Topic-level category routing for congressional text (CREC floor speeches,
 * LegiScan bills, GovInfo packages).
 *
 * Routes documents to monitoring categories using broad topic terms,
 * NOT the narrow erosion-detection keywords from ASSESSMENT_RULES.
 * The three-layer pipeline (L1/L2/L3) handles the actual assessment.
 */

import {
  OPINION_TERM_ADDITIONS,
  OPINION_TERM_EXCLUDES,
  TOPIC_ROUTING_TERMS,
} from '@/lib/data/topic-routing-terms';

/** Threshold below which terms get word-boundary matching to avoid substring false positives. */
const WORD_BOUNDARY_THRESHOLD = 5;

/**
 * Build a regex cache for terms that need word-boundary matching.
 * Short terms (e.g., "ICE", "DOJ", "APA", "FBI") would otherwise match
 * as substrings in common words (service, notice, practice, etc.).
 */
const regexCache = new Map<string, RegExp>();

export function matchesTerm(searchText: string, term: string): boolean {
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

/**
 * Default classification window for judicial opinions: the case name plus the
 * opening of the opinion (caption, syllabus, introduction), which states what
 * the case is about. Incidental citations and boilerplate live deeper in the
 * text and would over-route (see OPINION_TERM_EXCLUDES).
 */
export const OPINION_CLASSIFY_TEXT_CAP = 4000;

/** Options for classifyOpinionToCategories — overridable for audit tuning. */
export interface OpinionClassifyOptions {
  textCap?: number;
  excludes?: Record<string, string[]>;
  additions?: Record<string, string[]>;
}

/** Effective per-category term list for opinion routing (shared − excludes + additions). */
function opinionTermsFor(
  category: string,
  excludes: Record<string, string[]>,
  additions: Record<string, string[]>,
): string[] {
  const excluded = new Set((excludes[category] ?? []).map((t) => t.toLowerCase()));
  const base = (TOPIC_ROUTING_TERMS[category] ?? []).filter((t) => !excluded.has(t.toLowerCase()));
  return [...base, ...(additions[category] ?? [])];
}

/**
 * Route a JUDICIAL OPINION to zero or more monitoring categories (issue #528).
 *
 * Differs from classifyCrecToCategories in two speech-vs-opinion calibrations:
 * classification runs over the case name + a capped head of the opinion (not
 * the full text), and uses TOPIC_ROUTING_TERMS minus per-category judicial
 * boilerplate (OPINION_TERM_EXCLUDES) plus case-law vocabulary
 * (OPINION_TERM_ADDITIONS). Returns [] for opinions that are not about any
 * monitored topic — callers treat that as "do not ingest".
 */
export function classifyOpinionToCategories(
  caseName: string,
  text?: string | null,
  options: OpinionClassifyOptions = {},
): string[] {
  const cap = options.textCap ?? OPINION_CLASSIFY_TEXT_CAP;
  const excludes = options.excludes ?? OPINION_TERM_EXCLUDES;
  const additions = options.additions ?? OPINION_TERM_ADDITIONS;
  const searchText = `${caseName} ${(text || '').slice(0, cap)}`.toLowerCase();
  const matched = new Set<string>();

  for (const category of Object.keys(TOPIC_ROUTING_TERMS)) {
    for (const term of opinionTermsFor(category, excludes, additions)) {
      if (matchesTerm(searchText, term)) {
        matched.add(category);
        break;
      }
    }
  }

  return Array.from(matched);
}
