import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContentItem } from '@/lib/types';

vi.mock('@/lib/services/federal-register-fetcher', () => ({
  fetchFederalRegisterHistorical: vi.fn(),
  fetchFrRawText: vi.fn().mockResolvedValue('Full FR text'),
  parseSignalParams: vi.fn().mockReturnValue({}),
}));

// Retrieval-relevance filter (#524): keep everything unless a test says otherwise.
vi.mock('@/lib/services/retrieval-relevance-filter', () => ({
  partitionByRetrievalRelevance: vi.fn((_category: string, items: ContentItem[]) => ({
    kept: items,
    dropped: [],
  })),
}));

// The drop ledger records what the fetch would persist, so tests assert on
// its contents rather than on mock internals.
const { frDropLedger } = vi.hoisted(() => ({
  frDropLedger: [] as Array<{ category: string; signalUrl: string; urls: string[] }>,
}));
vi.mock('@/lib/services/fr-drop-ledger', () => ({
  recordFrDrops: vi.fn(
    async (category: string, signalUrl: string, dropped: Array<{ item: ContentItem }>) => {
      if (dropped.length > 0)
        frDropLedger.push({ category, signalUrl, urls: dropped.map((d) => d.item.link ?? '') });
    },
  ),
}));

vi.mock('@/lib/services/courtlistener-fetcher', () => ({
  fetchCourtListenerHistorical: vi.fn(),
  parseCourtListenerParams: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/services/doj-fetcher', () => ({
  fetchDojHistoricalPartitioned: vi.fn(),
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

vi.mock('@/lib/services/oversight-gov-fetcher', () => ({
  fetchOversightGovHistorical: vi.fn().mockResolvedValue([]),
  fetchOversightGovPdfUrl: vi.fn().mockResolvedValue(null),
  parseOversightGovParams: vi.fn().mockReturnValue({ oigs: [283] }),
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
const dojResult = (items: ContentItem[], excludedItems: ContentItem[] = []) => ({
  items,
  excludedItems,
});

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

  it('retries a failing signal 4 times before recording error', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    vi.mocked(fetchFederalRegisterHistorical).mockRejectedValue(new Error('HTTP 502'));

    const { fetchWeekItemsFr } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekItemsFr(
      [{ url: 'fr://test', type: 'federal_register' }],
      week,
      'executiveAuthority',
    );

    expect(fetchFederalRegisterHistorical).toHaveBeenCalledTimes(4);
    expect(result.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('HTTP 502');
    expect(result.errors[0]).toContain('after 4 attempts');
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

  it('returns retrieval-relevance drops only in excludedItems, with their text filled (#891)', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    const { partitionByRetrievalRelevance } =
      await import('@/lib/services/retrieval-relevance-filter');
    frDropLedger.length = 0;

    const kept = mockItem('Press access rule', 'https://fr.gov/kept');
    const dropped: ContentItem = {
      title: 'Routine meeting notice',
      link: 'https://fr.gov/dropped',
      metadata: { raw_text_url: 'https://fr.gov/dropped/raw' },
    };
    vi.mocked(fetchFederalRegisterHistorical).mockResolvedValue([kept, dropped]);
    vi.mocked(partitionByRetrievalRelevance).mockImplementationOnce((_c, items) => ({
      kept: items.filter((i) => i !== dropped),
      dropped: items.filter((i) => i === dropped).map((item) => ({ item, reason: 'no-match' })),
    }));

    const { fetchWeekItemsFr } = await import('@/lib/cron/backfill-fetchers');
    const result = await fetchWeekItemsFr(
      [{ url: 'fr://test', type: 'federal_register' }],
      week,
      'mediaFreedom',
    );

    expect(result.items).toEqual([kept]);
    expect(result.excludedItems).toEqual([dropped]);
    expect(dropped.content).toBe('Full FR text');
    // Ledger + fetch-log semantics unchanged: the drop is recorded, not counted.
    expect(frDropLedger).toEqual([
      { category: 'mediaFreedom', signalUrl: 'fr://test', urls: ['https://fr.gov/dropped'] },
    ]);
    expect(result.contentGaps).toBeUndefined();
  });
});

describe('dedupeExcludedItems', () => {
  it('dedupes by URL and drops any URL a routed item already carries', async () => {
    const { dedupeExcludedItems } = await import('@/lib/cron/backfill-fetchers');
    const routed = [mockItem('Routed', 'https://x/routed')];
    const excluded = [
      mockItem('Dup A', 'https://x/a'),
      mockItem('Dup A again', 'https://x/a'),
      mockItem('Also routed elsewhere', 'https://x/routed'),
      { title: 'No link' },
    ];

    expect(dedupeExcludedItems(routed, excluded)).toEqual([mockItem('Dup A', 'https://x/a')]);
  });
});

describe('fetchWeekDocuments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates sourceResults across groups', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    const { fetchDojHistoricalPartitioned } = await import('@/lib/services/doj-fetcher');

    vi.mocked(fetchFederalRegisterHistorical).mockResolvedValue([
      mockItem('FR doc', 'https://fr.gov/1'),
    ]);
    vi.mocked(fetchDojHistoricalPartitioned).mockResolvedValue(
      dojResult([mockItem('DOJ doc', 'https://doj.gov/1')]),
    );

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
        dhspress: [],
        gao: [],
      },
      'lawEnforcement',
    );

    expect(result.items).toHaveLength(2);
    expect(result.sourceResults).toHaveProperty('federal_register');
    expect(result.sourceResults).toHaveProperty('doj');
    expect(result.sourceResults.federal_register.itemCount).toBe(1);
    expect(result.sourceResults.federal_register.errors).toHaveLength(0);
    expect(result.sourceResults.doj.itemCount).toBe(1);
    expect(result.excludedItems).toEqual([]);
  });

  it('collects excluded items across sources, deduped and minus routed URLs (#891/#892)', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    const { partitionByRetrievalRelevance } =
      await import('@/lib/services/retrieval-relevance-filter');
    const { fetchDojHistoricalPartitioned } = await import('@/lib/services/doj-fetcher');

    const frKept = mockItem('FR kept', 'https://fr.gov/kept');
    const frDropped = mockItem('FR dropped', 'https://shared.gov/x');
    vi.mocked(fetchFederalRegisterHistorical).mockResolvedValue([frKept, frDropped]);
    vi.mocked(partitionByRetrievalRelevance).mockReturnValueOnce({
      kept: [frKept],
      dropped: [{ item: frDropped, reason: 'no-match' }],
    });
    // DOJ routes the very URL FR dropped, and rejects Y twice (two signals).
    const agRelease = mockItem('AG statement', 'https://doj.gov/y');
    vi.mocked(fetchDojHistoricalPartitioned).mockResolvedValue(
      dojResult([mockItem('Routed by DOJ', 'https://shared.gov/x')], [agRelease, { ...agRelease }]),
    );

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
        dhspress: [],
        gao: [],
      },
      'lawEnforcement',
    );

    expect(result.items.map((i) => i.link)).toEqual([
      'https://fr.gov/kept',
      'https://shared.gov/x',
    ]);
    // FR drops stay under the signal category; DOJ allowlisted releases go to
    // the corpus channel (deduped, minus routed URLs) — never a category row.
    expect(result.excludedItems).toEqual([]);
    expect(result.corpusItems).toEqual([agRelease]);
    // Excluded items never count toward a source's item count.
    expect(result.sourceResults.federal_register.itemCount).toBe(1);
    expect(result.sourceResults.doj.itemCount).toBe(1);
  });

  it('records errors in sourceResults when a source fails all retries', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    const { fetchDojHistoricalPartitioned } = await import('@/lib/services/doj-fetcher');

    vi.mocked(fetchFederalRegisterHistorical).mockResolvedValue([
      mockItem('FR doc', 'https://fr.gov/1'),
    ]);
    vi.mocked(fetchDojHistoricalPartitioned).mockRejectedValue(new Error('Timeout'));

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
        dhspress: [],
        gao: [],
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
      { fr: [], cl: [], doj: [], gi: [], fec: [], oig: [], dhspress: [], gao: [] },
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
        dhspress: [],
        gao: [],
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
        dhspress: [],
        gao: [],
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
        dhspress: [],
        gao: [],
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
        dhspress: [],
        gao: [],
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
        dhspress: [],
        gao: [],
      },
      'executiveOversight',
    );

    expect(result.items[0].content).toBe('Extracted DOJ OIG investigation report text');
  });

  it('fills oversight.gov content from metadata.pdfUrl without a detail re-scrape', async () => {
    const { fetchOversightGovHistorical, fetchOversightGovPdfUrl } =
      await import('@/lib/services/oversight-gov-fetcher');
    const { extractPdfText } = await import('@/lib/utils/pdf-extractor');

    vi.mocked(fetchOversightGovHistorical).mockResolvedValue([
      {
        title: 'OPM OIG Audit',
        link: 'https://www.oversight.gov/reports/audit/opm-example',
        content: 'Audit — 2025-A-001',
        type: 'ig_report',
        sourceOrigin: 'oig',
        metadata: {
          pdfUrl: 'https://www.oversight.gov/sites/default/files/documents/reports/x.pdf',
        },
      },
    ]);
    // Distinct texts per PDF path: the stored content proves which route ran.
    vi.mocked(fetchOversightGovPdfUrl).mockResolvedValue(
      'https://www.oversight.gov/sites/default/files/documents/reports/detail-scraped.pdf',
    );
    vi.mocked(extractPdfText).mockImplementation(async (url) =>
      url.endsWith('/x.pdf') ? 'Text from the metadata PDF' : 'Text from the detail-scraped PDF',
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
        oig: [{ url: 'oig://oversight?oigs=283', type: 'oig_html' }],
        dhspress: [],
        gao: [],
      },
      'civilService',
    );

    expect(result.items[0].content).toBe('Text from the metadata PDF');
  });

  it('falls back to the detail scrape when an oversight.gov item lacks metadata.pdfUrl', async () => {
    const { fetchOversightGovHistorical, fetchOversightGovPdfUrl } =
      await import('@/lib/services/oversight-gov-fetcher');
    const { extractPdfText } = await import('@/lib/utils/pdf-extractor');

    vi.mocked(fetchOversightGovHistorical).mockResolvedValue([
      {
        title: 'OPM OIG Audit',
        link: 'https://www.oversight.gov/reports/audit/opm-legacy',
        content: 'Audit — legacy',
        type: 'ig_report',
        sourceOrigin: 'oig',
      },
    ]);
    vi.mocked(fetchOversightGovPdfUrl).mockResolvedValue(
      'https://www.oversight.gov/sites/default/files/documents/reports/legacy.pdf',
    );
    vi.mocked(extractPdfText).mockImplementation(async (url) =>
      url.endsWith('/legacy.pdf') ? 'Text from the legacy PDF' : 'Wrong PDF fetched',
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
        oig: [{ url: 'oig://oversight?oigs=283', type: 'oig_html' }],
        dhspress: [],
        gao: [],
      },
      'civilService',
    );

    expect(result.items[0].content).toBe('Text from the legacy PDF');
  });

  it('deduplicates items across sources by URL', async () => {
    const { fetchFederalRegisterHistorical } =
      await import('@/lib/services/federal-register-fetcher');
    const { fetchDojHistoricalPartitioned } = await import('@/lib/services/doj-fetcher');

    const sharedUrl = 'https://shared.gov/doc1';
    vi.mocked(fetchFederalRegisterHistorical).mockResolvedValue([
      mockItem('Shared doc', sharedUrl),
    ]);
    vi.mocked(fetchDojHistoricalPartitioned).mockResolvedValue(
      dojResult([mockItem('Same doc', sharedUrl)]),
    );

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
        dhspress: [],
        gao: [],
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
