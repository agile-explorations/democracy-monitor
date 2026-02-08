import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCategoryFeeds } from '@/lib/services/feed-fetcher';
import type { Category, Signal } from '@/lib/types';

// Mock cache — always miss (I/O boundary)
vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

// Stub global fetch (network boundary)
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

// Real RSS/Atom XML for testing the full parsing pipeline
const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Breaking News</title>
      <link>https://example.com/article</link>
      <pubDate>Mon, 01 Feb 2026 12:00:00 GMT</pubDate>
      <description>&lt;p&gt;Summary text here&lt;/p&gt;</description>
    </item>
    <item>
      <title>Second Story</title>
      <link>https://example.com/article2</link>
      <description>Plain text summary</description>
    </item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Entry</title>
    <link href="https://example.com/entry"/>
    <published>2026-02-01T12:00:00Z</published>
    <summary>Atom summary text</summary>
  </entry>
</feed>`;

describe('fetchCategoryFeeds', () => {
  describe('federal_register signals', () => {
    it('fetches and maps Federal Register documents', async () => {
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
            {
              title: 'Proclamation on Unity',
              html_url: 'https://federalregister.gov/doc/2',
              publication_date: '2026-02-02',
              agencies: [{ name: 'White House' }],
            },
          ],
        }),
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Executive Order on Testing');
      expect(items[0].link).toBe('https://federalregister.gov/doc/1');
      expect(items[0].pubDate).toBe('2026-02-01');
      expect(items[0].agency).toBe('DOJ');
      expect(items[0].summary).toBe('An order about testing.');
      expect(items[1].title).toBe('Proclamation on Unity');
      expect(items[1].summary).toBeUndefined();
    });

    it('returns error item on non-ok response', async () => {
      const signal = makeSignal({
        type: 'federal_register',
        url: '/api/federal-register?agency=DOJ',
      });

      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].title).toContain('503');
      expect(items[0].isError).toBe(true);
    });
  });

  describe('rss signals', () => {
    it('parses real RSS XML into items', async () => {
      const signal = makeSignal({ type: 'rss' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => RSS_XML,
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Breaking News');
      expect(items[0].link).toBe('https://example.com/article');
      expect(items[0].pubDate).toBe('Mon, 01 Feb 2026 12:00:00 GMT');
      expect(items[0].summary).toBe('Summary text here');
      expect(items[1].title).toBe('Second Story');
      expect(items[1].summary).toBe('Plain text summary');
    });

    it('parses real Atom XML into items', async () => {
      const signal = makeSignal({ type: 'rss' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => ATOM_XML,
      });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Atom Entry');
      expect(items[0].link).toBe('https://example.com/entry');
      expect(items[0].pubDate).toBe('2026-02-01T12:00:00Z');
    });

    it('returns error item on non-ok response', async () => {
      const signal = makeSignal({ type: 'rss' });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const items = await fetchCategoryFeeds(makeCategory([signal]));

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
          '<a href="https://example.com/x">Hi</a>' +
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

  describe('error handling', () => {
    it('aggregates items from multiple signals', async () => {
      const signals = [
        makeSignal({ type: 'json', url: '/api/uptime/status' }),
        makeSignal({ type: 'rss', url: 'https://example.com/feed.rss' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => RSS_XML,
      });

      const items = await fetchCategoryFeeds(makeCategory(signals));

      // 1 from skipped JSON + 2 from RSS
      expect(items).toHaveLength(3);
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
