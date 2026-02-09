import type { ContentItem } from '@/lib/types';

/** Remove duplicate ContentItems by URL, keeping first occurrence. */
export function deduplicateByUrl(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.link || seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}
