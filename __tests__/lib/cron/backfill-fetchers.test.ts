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

vi.mock('@/lib/services/doj-oig-fetcher', () => ({
  fetchDojOigHistorical: vi.fn().mockResolvedValue([]),
  fetchDojOigPdfUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/services/hhs-oig-fetcher', () => ({
  fetchHhsOigHistorical: vi.fn().mockResolvedValue([]),
  fetchHhsOigReportContent: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/services/ssa-oig-fetcher', () => ({
  fetchSsaOigHistorical: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/services/fec-content', () => ({
  fetchFecEnrichedContent: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/utils/pdf-extractor', () => ({
  extractPdfText: vi.fn().mockResolvedValue(null),
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
        oig: [],
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
        oig: [],
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
      { fr: [], cl: [], doj: [], gi: [], fec: [], oig: [] },
      'executiveAuthority',
    );

    expect(result.items).toHaveLength(0);
    expect(Object.keys(result.sourceResults)).toHaveLength(0);
  });

  it('enriches FEC items with full content inline', async () => {
    const { fetchFecHistorical } = await import('@/lib/services/fec-fetcher');
    const { fetchFecEnrichedContent } = await import('@/lib/services/fec-content');

    vi.mocked(fetchFecHistorical).mockResolvedValue([
      {
        title: 'MUR 8353',
        link: 'https://www.fec.gov/data/legal/matter-under-review/8353/',
        content: 'Short metadata',
        sourceOrigin: 'fec',
      },
    ]);
    vi.mocked(fetchFecEnrichedContent).mockResolvedValue(
      'Enriched content with PDF text extraction and detailed disposition data',
    );

    const { fetchWeekDocuments } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekDocuments(
      week,
      {
        fr: [],
        cl: [],
        doj: [],
        gi: [],
        fec: [{ url: 'fec://mur', type: 'fec_json' }],
        oig: [],
      },
      'elections',
    );

    expect(result.items[0].content).toBe(
      'Enriched content with PDF text extraction and detailed disposition data',
    );
  });

  it('keeps original FEC summary when enrichment fails', async () => {
    const { fetchFecHistorical } = await import('@/lib/services/fec-fetcher');
    const { fetchFecEnrichedContent } = await import('@/lib/services/fec-content');

    vi.mocked(fetchFecHistorical).mockResolvedValue([
      {
        title: 'MUR 8353',
        link: 'https://www.fec.gov/data/legal/matter-under-review/8353/',
        content: 'Original metadata summary',
        sourceOrigin: 'fec',
      },
    ]);
    vi.mocked(fetchFecEnrichedContent).mockResolvedValue(null);

    const { fetchWeekDocuments } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekDocuments(
      week,
      {
        fr: [],
        cl: [],
        doj: [],
        gi: [],
        fec: [{ url: 'fec://mur', type: 'fec_json' }],
        oig: [],
      },
      'elections',
    );

    expect(result.items[0].content).toBe('Original metadata summary');
  });

  it('fills OIG HHS content by scraping detail page', async () => {
    const { fetchHhsOigHistorical, fetchHhsOigReportContent } =
      await import('@/lib/services/hhs-oig-fetcher');

    vi.mocked(fetchHhsOigHistorical).mockResolvedValue([
      {
        title: 'HHS Audit Report',
        link: 'https://oig.hhs.gov/reports/audit/2025-A-01',
        content: 'Audit A-01-25-00123',
        type: 'ig_report',
        sourceOrigin: 'oig',
      },
    ]);
    vi.mocked(fetchHhsOigReportContent).mockResolvedValue(
      'Full report text from HHS OIG detail page with findings and recommendations',
    );

    const { fetchWeekDocuments } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekDocuments(
      week,
      {
        fr: [],
        cl: [],
        doj: [],
        gi: [],
        fec: [],
        oig: [{ url: 'oig://hhs', type: 'oig_json' }],
      },
      'executiveOversight',
    );

    expect(result.items[0].content).toBe(
      'Full report text from HHS OIG detail page with findings and recommendations',
    );
  });

  it('fills OIG SSA content by extracting PDF text', async () => {
    const { fetchSsaOigHistorical } = await import('@/lib/services/ssa-oig-fetcher');
    const { extractPdfText } = await import('@/lib/utils/pdf-extractor');

    vi.mocked(fetchSsaOigHistorical).mockResolvedValue([
      {
        title: 'SSA Audit Report',
        link: 'https://oig.ssa.gov/assets/uploads/a-03-22-00123.pdf',
        content: 'Report A-03-22-00123',
        type: 'ig_report',
        sourceOrigin: 'oig',
      },
    ]);
    vi.mocked(extractPdfText).mockResolvedValue('Extracted PDF text from SSA OIG report');

    const { fetchWeekDocuments } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekDocuments(
      week,
      {
        fr: [],
        cl: [],
        doj: [],
        gi: [],
        fec: [],
        oig: [{ url: 'oig://ssa', type: 'oig_json' }],
      },
      'executiveOversight',
    );

    expect(result.items[0].content).toBe('Extracted PDF text from SSA OIG report');
  });

  it('fills OIG DOJ content by scraping PDF URL then extracting', async () => {
    const { fetchDojOigHistorical, fetchDojOigPdfUrl } =
      await import('@/lib/services/doj-oig-fetcher');
    const { extractPdfText } = await import('@/lib/utils/pdf-extractor');

    vi.mocked(fetchDojOigHistorical).mockResolvedValue([
      {
        title: 'DOJ OIG Investigation',
        link: 'https://oig.justice.gov/reports/2025/i-2025-001',
        content: 'Investigative Report — OIG',
        type: 'ig_report',
        sourceOrigin: 'oig',
      },
    ]);
    vi.mocked(fetchDojOigPdfUrl).mockResolvedValue(
      'https://oig.justice.gov/reports/2025/i-2025-001.pdf',
    );
    vi.mocked(extractPdfText).mockResolvedValue('Extracted DOJ OIG investigation report text');

    const { fetchWeekDocuments } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekDocuments(
      week,
      {
        fr: [],
        cl: [],
        doj: [],
        gi: [],
        fec: [],
        oig: [{ url: 'oig://doj', type: 'oig_json' }],
      },
      'executiveOversight',
    );

    expect(result.items[0].content).toBe('Extracted DOJ OIG investigation report text');
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
        oig: [],
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
