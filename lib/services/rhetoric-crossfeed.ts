/**
 * Rhetoric cross-feed: routes rhetoric documents (stored as category='intent')
 * to the 11 monitoring categories based on FR signal search terms.
 *
 * A rhetoric document is assigned to every category whose signal terms match
 * its title/summary. The original category='intent' row is preserved.
 */

import { CATEGORIES } from '@/lib/data/categories';
import { storeDocuments } from '@/lib/services/document-store';
import type { ContentItem } from '@/lib/types';

export interface CrossfeedTerm {
  category: string;
  terms: string[];
}

/**
 * Supplemental crossfeed terms for categories whose FR signals use type filters
 * rather than search terms (e.g., executiveActions filters by type=PRESDOCU).
 */
const SUPPLEMENTAL_TERMS: Record<string, string[]> = {
  executiveActions: [
    'executive order',
    'executive action',
    'presidential memorandum',
    'proclamation',
    'signing ceremony',
  ],
};

/**
 * Extract search terms from FR signal URLs for each category.
 * Parses the `term` query parameter, splitting on pipe (OR) operators
 * and stripping quotes from phrases.
 */
export function extractCategoryCrossfeedTerms(): CrossfeedTerm[] {
  return CATEGORIES.map((cat) => {
    const terms = new Set<string>();

    for (const signal of cat.signals) {
      if (signal.type !== 'federal_register') continue;

      const parsed = new URL(signal.url, 'http://localhost');
      const rawTerm = parsed.searchParams.get('term');
      if (!rawTerm) continue;

      // Split on pipe (OR), then clean up each term
      for (const part of rawTerm.split('|')) {
        const cleaned = part
          .trim()
          .replace(/"/g, '') // strip all quotes
          .replace(/[()]/g, '') // strip grouping parens
          .trim()
          .toLowerCase();
        if (cleaned.length > 2) terms.add(cleaned);
      }
    }

    // Add supplemental terms for categories that use type-based signals
    const extras = SUPPLEMENTAL_TERMS[cat.key] ?? [];
    for (const extra of extras) terms.add(extra);

    return { category: cat.key, terms: [...terms] };
  }).filter((entry) => entry.terms.length > 0);
}

/** Cached crossfeed terms — computed once since CATEGORIES is static. */
let cachedTerms: CrossfeedTerm[] | null = null;

function getCrossfeedTerms(): CrossfeedTerm[] {
  if (!cachedTerms) cachedTerms = extractCategoryCrossfeedTerms();
  return cachedTerms;
}

/**
 * Classify a rhetoric document into monitoring categories.
 * Returns all categories whose signal terms appear in the title/summary.
 */
export function classifyRhetoricToCategories(title: string, summary?: string): string[] {
  const text = `${title} ${summary || ''}`.toLowerCase();
  const allTerms = getCrossfeedTerms();
  const matched: string[] = [];

  for (const { category, terms } of allTerms) {
    for (const term of terms) {
      if (text.includes(term)) {
        matched.push(category);
        break; // one match per category is sufficient
      }
    }
  }

  return matched;
}

/**
 * Cross-feed rhetoric documents to monitoring categories.
 * For each item, classifies it into categories via signal term matching,
 * then stores a copy under each matched category.
 * Returns total number of category assignments.
 */
export async function crossfeedRhetoricToCategories(items: ContentItem[]): Promise<number> {
  let totalAssignments = 0;
  const categoryCounts: Record<string, number> = {};

  for (const item of items) {
    if (!item.link) continue;

    const categories = classifyRhetoricToCategories(item.title, item.summary);
    for (const category of categories) {
      await storeDocuments([item], category);
      totalAssignments++;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
  }

  if (totalAssignments > 0) {
    const catSummary = Object.entries(categoryCounts)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    console.log(
      `[crossfeed] ${items.length} items → ${totalAssignments} category assignments (${catSummary})`,
    );
  }

  return totalAssignments;
}
