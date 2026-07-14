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

/** Split an array into consecutive chunks of at most `size` elements. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
