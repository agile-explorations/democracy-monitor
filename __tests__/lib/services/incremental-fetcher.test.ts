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
  fetchWeekItemsDhsPress: vi.fn().mockResolvedValue({ items: [], errors: [] }),
  fetchWeekItemsGao: vi.fn().mockResolvedValue({ items: [], errors: [] }),
}));

const { fetchWeekItemsFr } = await import('@/lib/cron/backfill-fetchers');
const mockFetchWeekItemsFr = vi.mocked(fetchWeekItemsFr);

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
  ],
};

describe('fetchCategoryIncremental', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns API signal documents in results', async () => {
    const result = await fetchCategoryIncremental(testCategory, {}, '2026-02-20');

    expect(result.items).toContainEqual(expect.objectContaining({ title: 'FR Doc 1' }));
  });

  it('returns signal results with metadata', async () => {
    const result = await fetchCategoryIncremental(testCategory, {}, '2026-02-20');

    expect(result.signalResults).toHaveLength(1);
    expect(result.signalResults[0].signalId).toBe('fr-1');
    expect(result.signalResults[0].success).toBe(true);
    expect(result.signalResults[0].documentCount).toBe(1);
  });

  it('skips signal groups with no signals', async () => {
    const frOnly: Category = {
      key: 'frOnly',
      title: 'FR Only',
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

    const result = await fetchCategoryIncremental(frOnly, {}, '2026-02-20');
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

    const result = await fetchCategoryIncremental(cat, {}, '2026-02-20');
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

    const result = await fetchCategoryIncremental(cat, {}, '2026-02-20');
    const frResult = result.signalResults.find((r) => r.signalId === 'fr-err');
    expect(frResult).toBeDefined();
    expect(frResult!.success).toBe(false);
    expect(frResult!.errorMessage).toBe('API rate limit exceeded');
  });

  it('uses per-source dates when available, falls back otherwise', async () => {
    const sourceDates = { federal_register: '2026-03-01' };
    const result = await fetchCategoryIncremental(testCategory, sourceDates, '2026-01-01');

    expect(result.items).toHaveLength(1);
    expect(result.signalResults).toHaveLength(1);
  });

  it('handles empty category with no matching signal types', async () => {
    const emptyCat: Category = {
      key: 'empty',
      title: 'Empty',
      description: 'Test',
      signals: [],
    };

    const result = await fetchCategoryIncremental(emptyCat, {}, '2026-02-20');
    expect(result.items).toHaveLength(0);
    expect(result.signalResults).toHaveLength(0);
  });
});
