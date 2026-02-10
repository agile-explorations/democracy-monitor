import { describe, it, expect } from 'vitest';
import type { ContentItem } from '@/lib/types';
import { deduplicateByUrl } from '@/lib/utils/collections';

describe('deduplicateByUrl', () => {
  it('removes duplicate items by link, keeping first occurrence', () => {
    const items: ContentItem[] = [
      { title: 'First', link: 'https://example.com/a' },
      { title: 'Second', link: 'https://example.com/b' },
      { title: 'Duplicate of First', link: 'https://example.com/a' },
    ];
    const result = deduplicateByUrl(items);
    expect(result).toEqual([
      { title: 'First', link: 'https://example.com/a' },
      { title: 'Second', link: 'https://example.com/b' },
    ]);
  });

  it('filters out items without a link', () => {
    const items: ContentItem[] = [
      { title: 'No link' },
      { title: 'Has link', link: 'https://example.com/a' },
      { title: 'Also no link', link: undefined },
    ];
    const result = deduplicateByUrl(items);
    expect(result).toEqual([{ title: 'Has link', link: 'https://example.com/a' }]);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateByUrl([])).toEqual([]);
  });

  it('returns all items when all links are unique', () => {
    const items: ContentItem[] = [
      { title: 'A', link: 'https://a.com' },
      { title: 'B', link: 'https://b.com' },
      { title: 'C', link: 'https://c.com' },
    ];
    expect(deduplicateByUrl(items)).toHaveLength(3);
  });

  it('returns empty array when all items lack links', () => {
    const items: ContentItem[] = [{ title: 'No link 1' }, { title: 'No link 2' }];
    expect(deduplicateByUrl(items)).toEqual([]);
  });
});
