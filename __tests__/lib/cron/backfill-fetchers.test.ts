import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContentItem } from '@/lib/types';

vi.mock('@/lib/services/federal-register-fetcher', () => ({
  fetchFederalRegisterHistorical: vi.fn(),
  parseSignalParams: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/services/courtlistener-fetcher', () => ({
  fetchCourtListenerHistorical: vi.fn(),
  parseCourtListenerParams: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/services/doj-fetcher', () => ({
  fetchDojHistorical: vi.fn(),
  parseDojSignalParams: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/services/govinfo-fetcher', () => ({
  fetchGovInfoHistorical: vi.fn(),
  parseGovInfoParams: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/services/fec-fetcher', () => ({
  fetchFecHistorical: vi.fn(),
  parseFecParams: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/utils/async', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

const week = { start: '2025-01-20', end: '2025-01-27' };
const mockItem = (title: string, link: string): ContentItem => ({ title, link });

describe('fetchWeekItemsFr', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns items and empty errors on success', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    vi.mocked(fetchFederalRegisterHistorical).mockResolvedValue([
      mockItem('EO 1', 'https://fr.gov/1'),
    ]);

    const { fetchWeekItemsFr } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekItemsFr(
      [{ url: 'fr://test', type: 'federal_register' }],
      week,
      'executiveAuthority',
    );

    expect(result.items).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('retries a failing signal 3 times before recording error', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    vi.mocked(fetchFederalRegisterHistorical).mockRejectedValue(new Error('HTTP 502'));

    const { fetchWeekItemsFr } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekItemsFr(
      [{ url: 'fr://test', type: 'federal_register' }],
      week,
      'executiveAuthority',
    );

    expect(fetchFederalRegisterHistorical).toHaveBeenCalledTimes(3);
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('HTTP 502');
    expect(result.errors[0]).toContain('after 3 attempts');
  });

  it('succeeds on retry after transient failure', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    vi.mocked(fetchFederalRegisterHistorical)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce([mockItem('EO 1', 'https://fr.gov/1')]);

    const { fetchWeekItemsFr } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekItemsFr(
      [{ url: 'fr://test', type: 'federal_register' }],
      week,
      'executiveAuthority',
    );

    expect(fetchFederalRegisterHistorical).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('captures error for one signal while others succeed', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    vi.mocked(fetchFederalRegisterHistorical)
      .mockResolvedValueOnce([mockItem('EO 1', 'https://fr.gov/1')]) // signal 1 ok
      .mockRejectedValue(new Error('HTTP 502')); // signal 2 fails all 3 attempts

    const { fetchWeekItemsFr } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekItemsFr(
      [
        { url: 'fr://test1', type: 'federal_register' },
        { url: 'fr://test2', type: 'federal_register' },
      ],
      week,
      'executiveAuthority',
    );

    expect(result.items).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('HTTP 502');
  });
});

describe('fetchWeekDocuments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates sourceResults across groups', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    const { fetchDojHistorical } = await import('@/lib/services/doj-fetcher');

    vi.mocked(fetchFederalRegisterHistorical).mockResolvedValue([
      mockItem('FR doc', 'https://fr.gov/1'),
    ]);
    vi.mocked(fetchDojHistorical).mockResolvedValue([mockItem('DOJ doc', 'https://doj.gov/1')]);

    const { fetchWeekDocuments } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekDocuments(
      week,
      {
        fr: [{ url: 'fr://test', type: 'federal_register' }],
        cl: [],
        doj: [{ url: 'doj://test', type: 'doj_json' }],
        gi: [],
        fec: [],
      },
      'lawEnforcement',
    );

    expect(result.items).toHaveLength(2);
    expect(result.sourceResults).toHaveProperty('federal_register');
    expect(result.sourceResults).toHaveProperty('doj');
    expect(result.sourceResults.federal_register.itemCount).toBe(1);
    expect(result.sourceResults.federal_register.errors).toHaveLength(0);
    expect(result.sourceResults.doj.itemCount).toBe(1);
  });

  it('records errors in sourceResults when a source fails all retries', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    const { fetchDojHistorical } = await import('@/lib/services/doj-fetcher');

    vi.mocked(fetchFederalRegisterHistorical).mockResolvedValue([
      mockItem('FR doc', 'https://fr.gov/1'),
    ]);
    vi.mocked(fetchDojHistorical).mockRejectedValue(new Error('Timeout'));

    const { fetchWeekDocuments } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekDocuments(
      week,
      {
        fr: [{ url: 'fr://test', type: 'federal_register' }],
        cl: [],
        doj: [{ url: 'doj://test', type: 'doj_json' }],
        gi: [],
        fec: [],
      },
      'lawEnforcement',
    );

    expect(result.items).toHaveLength(1);
    expect(result.sourceResults.doj.itemCount).toBe(0);
    expect(result.sourceResults.doj.errors).toHaveLength(1);
    expect(result.sourceResults.doj.errors[0]).toContain('Timeout');
  });

  it('skips groups with no signals', async () => {
    const { fetchWeekDocuments } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekDocuments(
      week,
      { fr: [], cl: [], doj: [], gi: [], fec: [] },
      'executiveAuthority',
    );

    expect(result.items).toHaveLength(0);
    expect(Object.keys(result.sourceResults)).toHaveLength(0);
  });

  it('deduplicates items across sources by URL', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    const { fetchDojHistorical } = await import('@/lib/services/doj-fetcher');

    const sharedUrl = 'https://shared.gov/doc1';
    vi.mocked(fetchFederalRegisterHistorical).mockResolvedValue([
      mockItem('Shared doc', sharedUrl),
    ]);
    vi.mocked(fetchDojHistorical).mockResolvedValue([mockItem('Same doc', sharedUrl)]);

    const { fetchWeekDocuments } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekDocuments(
      week,
      {
        fr: [{ url: 'fr://test', type: 'federal_register' }],
        cl: [],
        doj: [{ url: 'doj://test', type: 'doj_json' }],
        gi: [],
        fec: [],
      },
      'lawEnforcement',
    );

    // sourceResults track pre-dedup counts
    expect(result.sourceResults.federal_register.itemCount).toBe(1);
    expect(result.sourceResults.doj.itemCount).toBe(1);
    // items are deduped
    expect(result.items).toHaveLength(1);
  });
});
