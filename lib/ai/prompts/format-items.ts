import type { ContentItem } from '@/lib/types';

/** Format content items as numbered text summaries for LLM prompt injection. */
export function formatItemSummaries(items: ContentItem[], limit = 20): string {
  return items
    .slice(0, limit)
    .map((item, i) => {
      const parts = [`${i + 1}. "${item.title}"`];
      if (item.agency) parts.push(`(${item.agency})`);
      if (item.pubDate) parts.push(`[${item.pubDate}]`);
      if (item.summary) parts.push(`— ${item.summary.slice(0, 500)}`);
      return parts.join(' ');
    })
    .join('\n');
}
