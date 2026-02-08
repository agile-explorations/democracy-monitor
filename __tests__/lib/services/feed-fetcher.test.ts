import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseStringPromise } from 'xml2js';
import { fetchCategoryFeeds } from '@/lib/services/feed-fetcher';
import type { Category, Signal } from '@/lib/types';

// Mock cache — always miss
vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

// Mock xml2js
vi.mock('xml2js', () => ({
  parseStringPromise: vi.fn(),
}));

// Stub global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeSignal(overrides: Partial<Signal> & { type: Signal['type'] }): Signal {
  return {
    name: 'Test Signal',
    url: 'https://example.com/feed',
    ...overrides,
  };
}

function makeCategory(signals: Signal[]): Category {
  return {
    key: 'test_category',
    title: 'Test Category',
    description: 'Test',
    signals,
  };
}

describe('fetchCategoryFeeds', () => {
  describe('federal_register signals', () => {
    it('fetches from Federal Register API and maps results', async () => {
      const signal = makeSignal({
        type: 'federal_register',
        url: '/api/federal-register?agency=DOJ&type=PRESDOCU',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'Executive Order on Testing',
              html_url: 'https://federalregister.gov/doc/1',
              publication_date: '2026-02-01',
              agencies: [{ name: 'DOJ' }],
              abstract: '<p>An order about testing.</p>',
            },
          ],
        }),
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Executive Order on Testing');
      expect(items[0].link).toBe('https://federalregister.gov/doc/1');
      expect(items[0].pubDate).toBe('2026-02-01');
      expect(items[0].summary).toBe('An order about testing.');

      // Verify the correct external URL was called
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('www.federalregister.gov/api/v1/documents.json');
      expect(calledUrl).toContain('conditions%5Bagencies%5D%5B%5D=DOJ');
      expect(calledUrl).toContain('conditions%5Btype%5D%5B%5D=PRESDOCU');
    });

    it('returns error item on non-ok response', async () => {
      const signal = makeSignal({
        type: 'federal_register',
        url: '/api/federal-register?agency=DOJ',
      });

      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].title).toContain('Federal Register error: 503');
      expect(items[0].isError).toBe(true);
    });
  });

  describe('rss signals', () => {
    it('parses RSS feed items', async () => {
      const signal = makeSignal({ type: 'rss' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<rss>mock</rss>',
      });

      vi.mocked(parseStringPromise).mockResolvedValueOnce({
        rss: {
          channel: {
            item: [
              {
                title: 'Breaking News',
                link: 'https://example.com/article',
                pubDate: 'Mon, 01 Feb 2026 12:00:00 GMT',
                description: '<p>Summary text</p>',
              },
            ],
          },
        },
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Breaking News');
      expect(items[0].link).toBe('https://example.com/article');
      expect(items[0].summary).toBe('Summary text');
    });

    it('handles Atom feed format', async () => {
      const signal = makeSignal({ type: 'rss' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<feed>mock</feed>',
      });

      vi.mocked(parseStringPromise).mockResolvedValueOnce({
        feed: {
          entry: [
            {
              title: 'Atom Entry',
              link: { href: 'https://example.com/entry' },
              published: '2026-02-01T12:00:00Z',
              summary: 'Atom summary',
            },
          ],
        },
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Atom Entry');
      expect(items[0].link).toBe('https://example.com/entry');
    });

    it('handles summary as object (xml2js nested element)', async () => {
      const signal = makeSignal({ type: 'rss' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<rss>mock</rss>',
      });

      vi.mocked(parseStringPromise).mockResolvedValueOnce({
        rss: {
          channel: {
            item: [
              {
                title: 'Item with object summary',
                link: 'https://example.com/1',
                summary: { _: 'nested', $: { type: 'html' } },
              },
            ],
          },
        },
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].summary).toBeUndefined(); // non-string summary skipped safely
    });

    it('returns error item on non-ok response', async () => {
      const signal = makeSignal({ type: 'rss' });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items[0].title).toContain('RSS error: 404');
      expect(items[0].isError).toBe(true);
    });
  });

  describe('json signals', () => {
    it('skips internal API URLs', async () => {
      const signal = makeSignal({ type: 'json', url: '/api/uptime/status' });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].title).toContain('skipped (internal API)');
      expect(items[0].isWarning).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches and maps JSON array', async () => {
      const signal = makeSignal({ type: 'json', url: 'https://api.example.com/data' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { title: 'Item 1', link: 'https://example.com/1' },
          { title: 'Item 2', url: 'https://example.com/2' },
        ],
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Item 1');
      expect(items[0].link).toBe('https://example.com/1');
      expect(items[1].link).toBe('https://example.com/2');
    });

    it('wraps non-array JSON response as single item', async () => {
      const signal = makeSignal({
        type: 'json',
        name: 'Status API',
        url: 'https://api.example.com/status',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', uptime: 99.9 }),
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].title).toContain('Status API: data received');
    });
  });

  describe('html signals', () => {
    it('extracts links from HTML', async () => {
      const signal = makeSignal({ type: 'html', url: 'https://example.com/page' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '<html><body>' +
          '<a href="https://example.com/article1">Important Article Title</a>' +
          '<a href="/relative">Another Article Here</a>' +
          '</body></html>',
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Important Article Title');
      expect(items[0].link).toBe('https://example.com/article1');
      expect(items[1].link).toBe('https://example.com/relative');
    });

    it('filters out short text and javascript: links', async () => {
      const signal = makeSignal({ type: 'html', url: 'https://example.com/page' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '<a href="javascript:void(0)">Click here for more</a>' +
          '<a href="https://example.com/x">Hi</a>' + // too short
          '<a href="https://example.com/real">A Real Article Title</a>',
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('A Real Article Title');
    });

    it('returns warning when no links found', async () => {
      const signal = makeSignal({ type: 'html', url: 'https://example.com/page' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body>No links here</body></html>',
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].isWarning).toBe(true);
    });
  });

  describe('multiple signals', () => {
    it('aggregates items from all signals in a category', async () => {
      const signals = [
        makeSignal({ type: 'json', url: '/api/uptime/status' }),
        makeSignal({ type: 'rss', url: 'https://example.com/feed.rss' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '<rss>mock</rss>',
      });

      vi.mocked(parseStringPromise).mockResolvedValueOnce({
        rss: {
          channel: {
            item: { title: 'RSS Item', link: 'https://example.com/1' },
          },
        },
      });

      const items = await fetchCategoryFeeds(makeCategory(signals));

      // 1 from skipped JSON + 1 from RSS
      expect(items).toHaveLength(2);
    });

    it('returns error items for failed signals without crashing', async () => {
      const signals = [makeSignal({ type: 'rss', url: 'https://example.com/feed.rss' })];

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const items = await fetchCategoryFeeds(makeCategory(signals));

      expect(items).toHaveLength(1);
      expect(items[0].title).toContain('Error loading');
      expect(items[0].isError).toBe(true);
    });
  });
});
