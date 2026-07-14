import { RETRIEVAL_RELEVANCE_PATTERNS } from '@/lib/data/retrieval-relevance-patterns';
import type { RelevancePatternSet } from '@/lib/data/retrieval-relevance-patterns';
import type { ContentItem } from '@/lib/types';

/**
 * Retrieval relevance filter (#524): decides whether a document retrieved by
 * a broad full-text FR term query is actually about the category's subject.
 * Pure and deterministic; matches title + abstract only (stored content
 * begins with FR header boilerplate and must not be used here).
 */

export interface RelevanceInput {
  title: string;
  abstract?: string | null;
}

export interface RelevanceResult {
  relevant: boolean;
  /** Source of the decision, for the drop ledger. */
  reason: 'no-filter-for-category' | 'allow-match' | 'no-allow-match' | 'excluded';
}

/** True when the category has a retrieval relevance pattern set configured. */
export function hasRelevanceFilter(category: string): boolean {
  return RETRIEVAL_RELEVANCE_PATTERNS[category] != null;
}

export function assessRetrievalRelevance(category: string, doc: RelevanceInput): RelevanceResult {
  const patterns: RelevancePatternSet | undefined = RETRIEVAL_RELEVANCE_PATTERNS[category];
  if (!patterns) return { relevant: true, reason: 'no-filter-for-category' };

  const text = `${doc.title}\n${doc.abstract ?? ''}`;
  if (!patterns.allow.some((re) => re.test(text))) {
    return { relevant: false, reason: 'no-allow-match' };
  }
  if (patterns.exclude.some((re) => re.test(doc.title))) {
    return { relevant: false, reason: 'excluded' };
  }
  return { relevant: true, reason: 'allow-match' };
}

export interface DroppedItem {
  item: ContentItem;
  reason: RelevanceResult['reason'];
}

/**
 * Split fetched items into kept and dropped for a category. For FR items the
 * `content` field at fetch time is the (truncated) abstract, which is what
 * the filter matches alongside the title.
 */
export function partitionByRetrievalRelevance(
  category: string,
  items: ContentItem[],
): { kept: ContentItem[]; dropped: DroppedItem[] } {
  if (!hasRelevanceFilter(category)) return { kept: items, dropped: [] };

  const kept: ContentItem[] = [];
  const dropped: DroppedItem[] = [];
  for (const item of items) {
    const result = assessRetrievalRelevance(category, {
      title: item.title ?? '',
      abstract: item.content,
    });
    if (result.relevant) kept.push(item);
    else dropped.push({ item, reason: result.reason });
  }
  return { kept, dropped };
}
