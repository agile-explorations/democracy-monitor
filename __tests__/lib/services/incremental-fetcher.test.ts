import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCategoryIncremental } from '@/lib/services/incremental-fetcher';
import type { Category } from '@/lib/types';

vi.mock('@/lib/cron/backfill-fetchers', () => ({
  fetchWeekItemsFr: vi.fn().mockResolvedValue({
    items: [{ title: 'FR Doc 1', link: 'https://fr.gov/1', type: 'Notice' }],
    errors: [],
  }),
  fetchWeekItemsCourtListener: vi.fn().mockResolvedValue({ items: [], errors: [] }),
  fetchWeekItemsDoj: vi.fn().mockResolvedValue({ items: [], errors: [] }),
  fetchWeekItemsGovInfo: vi.fn().mockResolvedValue({ items: [], errors: [] }),
  fetchWeekItemsFec: vi.fn().mockResolvedValue({ items: [], errors: [] }),
  fetchWeekItemsOig: vi.fn().mockResolvedValue({ items: [], errors: [] }),
}));

vi.mock('@/lib/services/feed-fetcher', () => ({
  fetchSignalWithMetadata: vi.fn().mockResolvedValue({
    signalId: 'rss-signal-1',
    signalName: 'RSS Feed',
    signalType: 'rss',
    success: true,
    documentCount: 2,
    durationMs: 100,
    items: [
      { title: 'RSS Item 1', link: 'https://example.com/rss1' },
      { title: 'RSS Item 2', link: 'https://example.com/rss2' },
    ],
  }),
}));

const testCategory: Category = {
  key: 'testCategory',
  title: 'Test Category',
  description: 'Test',
  signals: [
    {
      id: 'fr-1',
      name: 'FR Signal',
      url: 'https://federalregister.gov/test',
      type: 'federal_register',
    },
    { id: 'rss-1', name: 'RSS Feed', url: 'https://example.com/feed.xml', type: 'rss' },
  ],
};

describe('fetchCategoryIncremental', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns API signal documents in results', async () => {
    const result = await fetchCategoryIncremental(testCategory, '2026-02-20');

    expect(result.items).toContainEqual(expect.objectContaining({ title: 'FR Doc 1' }));
  });

  it('returns RSS signal documents in results', async () => {
    const result = await fetchCategoryIncremental(testCategory, '2026-02-20');

    expect(result.items).toContainEqual(expect.objectContaining({ title: 'RSS Item 1' }));
  });

  it('combines results from API and RSS signals', async () => {
    const result = await fetchCategoryIncremental(testCategory, '2026-02-20');

    // 1 FR item + 2 RSS items
    expect(result.items).toHaveLength(3);
    expect(result.signalResults).toHaveLength(2);
  });

  it('handles categories with no API signals', async () => {
    const rssOnly: Category = {
      key: 'rssOnly',
      title: 'RSS Only',
      description: 'Test',
      signals: [
        { id: 'rss-1', name: 'RSS Feed', url: 'https://example.com/feed.xml', type: 'rss' },
      ],
    };

    const result = await fetchCategoryIncremental(rssOnly, '2026-02-20');
    expect(result.items).toHaveLength(2);
    expect(result.signalResults).toHaveLength(1);
  });

  it('handles categories with no RSS signals', async () => {
    const apiOnly: Category = {
      key: 'apiOnly',
      title: 'API Only',
      description: 'Test',
      signals: [
        {
          id: 'fr-1',
          name: 'FR Signal',
          url: 'https://federalregister.gov/test',
          type: 'federal_register',
        },
      ],
    };

    const result = await fetchCategoryIncremental(apiOnly, '2026-02-20');
    expect(result.items).toHaveLength(1);
    expect(result.signalResults).toHaveLength(1);
  });
});
