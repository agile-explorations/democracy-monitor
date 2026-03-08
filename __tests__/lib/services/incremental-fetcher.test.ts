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

const { fetchWeekItemsFr } = await import('@/lib/cron/backfill-fetchers');
const mockFetchWeekItemsFr = vi.mocked(fetchWeekItemsFr);

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

const { fetchSignalWithMetadata } = await import('@/lib/services/feed-fetcher');
const mockFetchSignalWithMetadata = vi.mocked(fetchSignalWithMetadata);

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

  it('falls back to signal url as signalId when id is nullish', async () => {
    const cat: Category = {
      key: 'noId',
      title: 'No ID Category',
      description: 'Test',
      signals: [
        {
          // Simulate runtime data where id is missing (e.g., from untyped JSON)
          id: undefined as unknown as string,
          name: 'FR No ID',
          url: 'https://federalregister.gov/no-id',
          type: 'federal_register',
        },
      ],
    };

    const result = await fetchCategoryIncremental(cat, '2026-02-20');
    expect(result.signalResults[0].signalId).toBe('https://federalregister.gov/no-id');
  });

  it('marks signal result as failed when fetcher returns errors', async () => {
    mockFetchWeekItemsFr.mockResolvedValueOnce({
      items: [],
      errors: ['API rate limit exceeded'],
    });

    const cat: Category = {
      key: 'errorCat',
      title: 'Error Category',
      description: 'Test',
      signals: [
        {
          id: 'fr-err',
          name: 'FR Error',
          url: 'https://federalregister.gov/err',
          type: 'federal_register',
        },
      ],
    };

    const result = await fetchCategoryIncremental(cat, '2026-02-20');
    const frResult = result.signalResults.find((r) => r.signalId === 'fr-err');
    expect(frResult).toBeDefined();
    expect(frResult!.success).toBe(false);
    expect(frResult!.errorMessage).toBe('API rate limit exceeded');
  });

  it('excludes results from rejected RSS signal fetches', async () => {
    mockFetchSignalWithMetadata.mockRejectedValueOnce(new Error('RSS fetch failed'));

    const cat: Category = {
      key: 'rssReject',
      title: 'RSS Reject',
      description: 'Test',
      signals: [
        {
          id: 'rss-bad',
          name: 'Bad RSS',
          url: 'https://example.com/bad.xml',
          type: 'rss',
        },
      ],
    };

    const result = await fetchCategoryIncremental(cat, '2026-02-20');
    // Rejected promise is silently dropped — no items, no signal results
    expect(result.items).toHaveLength(0);
    expect(result.signalResults).toHaveLength(0);
  });
});
