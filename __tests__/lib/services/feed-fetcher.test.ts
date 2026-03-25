import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSignalWithMetadata } from '@/lib/services/feed-fetcher';
import type { Signal } from '@/lib/types';

// Mock cache — always miss (I/O boundary)
vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

// Mock sleep to avoid real delays in tests
vi.mock('@/lib/utils/async', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
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

describe('fetchSignalWithMetadata', () => {
  describe('federal_register signals', () => {
    it('fetches and maps Federal Register documents', async () => {
      const signal = makeSignal({
        id: 'fr_test',
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

      const result = await fetchSignalWithMetadata(signal);

      expect(result.success).toBe(true);
      expect(result.documentCount).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].title).toBe('Executive Order on Testing');
      expect(result.items[0].link).toBe('https://federalregister.gov/doc/1');
      expect(result.items[0].pubDate).toBe('2026-02-01');
      expect(result.items[0].agency).toBe('DOJ');
      expect(result.items[0].content).toBe('An order about testing.');
      expect(result.items[1].title).toBe('Proclamation on Unity');
      expect(result.items[1].content).toBeUndefined();
    });

    it('returns error item on non-ok response after retries', async () => {
      const signal = makeSignal({
        id: 'fr_test',
        type: 'federal_register',
        url: '/api/federal-register?agency=DOJ',
      });

      // fetchWithRetry retries on 503 (3 attempts by default)
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: false, status: 503 });

      const result = await fetchSignalWithMetadata(signal);

      expect(result.success).toBe(true); // FR returns error items, not exceptions
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toContain('503');
      expect(result.items[0].isError).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns error result for network failures', async () => {
      const signal = makeSignal({
        id: 'fr_test',
        type: 'federal_register',
        url: '/api/federal-register?agency=DOJ',
      });

      // fetchWithRetry retries 3 times — all must fail
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchSignalWithMetadata(signal);

      expect(result.success).toBe(false);
      expect(result.documentCount).toBe(0);
      expect(result.errorMessage).toContain('Network error');
      expect(result.items[0].isError).toBe(true);
    });

    it('returns empty for unknown signal types', async () => {
      const signal = makeSignal({
        id: 'unknown_signal',
        type: 'unknown' as Signal['type'],
        url: 'https://example.com',
      });

      const result = await fetchSignalWithMetadata(signal);

      expect(result.success).toBe(true);
      expect(result.documentCount).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  describe('fetchWithRetry integration', () => {
    it('FR 503 then success returns items via retry', async () => {
      const signal = makeSignal({
        id: 'fr_test',
        type: 'federal_register',
        url: '/api/federal-register?agency=DOJ',
      });

      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'Retried Doc',
              html_url: 'https://federalregister.gov/doc/1',
              publication_date: '2026-02-01',
            },
          ],
        }),
      });

      const result = await fetchSignalWithMetadata(signal);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Retried Doc');
    });
  });
});
