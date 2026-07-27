import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPaginationFitness,
  getFrPeriodCoverage,
} from '@/lib/services/ingest-validation-queries';
import {
  getDocumentCoverage,
  getContentCompleteness,
} from '@/lib/services/ingest-validation-service';
import type { IngestReport } from '@/lib/services/ingest-validation-service';
import { collectWarningDetails } from '@/lib/services/ingest-warnings';

function createChainable(defaultValue: unknown = []) {
  const obj: Record<string, unknown> = {};
  for (const method of ['select', 'from', 'where', 'groupBy', 'orderBy']) {
    obj[method] = vi.fn().mockReturnValue(obj);
  }
  obj.then = (resolve: (v: unknown) => void) => Promise.resolve(defaultValue).then(resolve);
  return obj;
}

let chainable: ReturnType<typeof createChainable>;
const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(true),
  getDb: vi.fn(() => ({
    select: (...args: unknown[]) => {
      (chainable.select as ReturnType<typeof vi.fn>)(...args);
      return chainable;
    },
    execute: mockExecute,
  })),
}));

vi.mock('@/lib/db/schema', () => ({
  documents: {
    id: 'documents.id',
    category: 'documents.category',
    sourceOrigin: 'documents.source_origin',
    sourceType: 'documents.source_type',
    embeddedAt: 'documents.embedded_at',
    publishedAt: 'documents.published_at',
    url: 'documents.url',
    contentType: 'documents.content_type',
    content: 'documents.content',
    caseId: 'documents.case_id',
  },
}));

describe('ingest-validation-service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    chainable = createChainable([]);
    mockExecute.mockResolvedValue({ rows: [] });

    const { getDb } = await import('@/lib/db');
    vi.mocked(getDb).mockImplementation(
      () =>
        ({
          select: (...args: unknown[]) => {
            (chainable.select as ReturnType<typeof vi.fn>)(...args);
            return chainable;
          },
          execute: mockExecute,
        }) as never,
    );
  });

  it('returns empty defaults when DB is unavailable', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(false);

    expect(await getDocumentCoverage()).toEqual([]);
    expect(await getContentCompleteness()).toEqual([]);
    expect(await getPaginationFitness()).toEqual([]);
    expect(await getFrPeriodCoverage()).toEqual([]);
  });

  describe('getDocumentCoverage', () => {
    it('maps rows to DocumentCoverage objects', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);
      chainable = createChainable([
        { category: 'executiveActions', sourceOrigin: 'federal_register', count: '42' },
        { category: 'civilService', sourceOrigin: 'courtlistener', count: '18' },
      ]);

      const result = await getDocumentCoverage();
      expect(result).toEqual([
        { category: 'executiveActions', sourceOrigin: 'federal_register', count: 42 },
        { category: 'civilService', sourceOrigin: 'courtlistener', count: 18 },
      ]);
    });

    it('applies category filter', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);
      chainable = createChainable([]);

      await getDocumentCoverage('civilService');
      expect(chainable.where).toHaveBeenCalled();
    });
  });

  describe('getPaginationFitness', () => {
    it('maps raw execute rows to PaginationFitness', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);
      mockExecute.mockResolvedValue({
        rows: [
          { category: 'civilLiberties', source_origin: 'courtlistener', peak_weekly_count: 250 },
        ],
      });

      const result = await getPaginationFitness();
      expect(result).toEqual([
        { category: 'civilLiberties', sourceOrigin: 'courtlistener', peakWeeklyCount: 250 },
      ]);
    });
  });

  describe('getFrPeriodCoverage', () => {
    it('maps raw rows to SourcePeriodCoverage with sourceOrigin=federal_register', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      mockExecute.mockResolvedValue({
        rows: [
          { category: 'executiveActions', period: 'biden_2022', count: 42 },
          { category: 'executiveActions', period: 'trump_t2', count: 18 },
        ],
      });

      const result = await getFrPeriodCoverage();
      expect(result).toEqual([
        {
          category: 'executiveActions',
          sourceOrigin: 'federal_register',
          period: 'biden_2022',
          count: 42,
        },
        {
          category: 'executiveActions',
          sourceOrigin: 'federal_register',
          period: 'trump_t2',
          count: 18,
        },
      ]);
    });
  });
});

describe('collectWarningDetails', () => {
  function emptyReport(overrides: Partial<IngestReport> = {}): IngestReport {
    return {
      documentCoverage: [],
      contentCompleteness: [],
      contentCompletenessByOrigin: [],
      paginationFitness: [],
      frPeriodCoverage: [],
      cpdPeriodCoverage: [],
      sourcePeriodCoverage: [],
      clOpinionCoverage: null,
      signalCoverageGaps: [],
      fetchErrors: [],
      warnings: [],
      warningDetails: [],
      ...overrides,
    };
  }

  it('warns when CL pagination cap is hit', () => {
    const report = emptyReport({
      paginationFitness: [
        { category: 'civilLiberties', sourceOrigin: 'courtlistener', peakWeeklyCount: 950 },
      ],
    });
    const warnings = collectWarningDetails(report);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        severity: 'action',
        text: expect.stringContaining('civilLiberties CourtListener peak=950'),
      }),
    );
  });

  it('warns for fixable null-content source types', () => {
    const report = emptyReport({
      contentCompleteness: [
        { sourceType: 'Presidential Document', total: 5000, nullContent: 2586 },
      ],
    });
    const warnings = collectWarningDetails(report);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        severity: 'action',
        text: expect.stringContaining('2586 Presidential Document docs have null content'),
      }),
    );
  });

  it('returns no pagination or content warnings when those sections are clean', () => {
    const report = emptyReport();
    const warnings = collectWarningDetails(report);
    // No content or pagination warnings (FR coverage warnings are expected
    // since the report has no FR data — that's correct behavior)
    expect(warnings.filter((w) => w.text.includes('null content'))).toEqual([]);
    expect(warnings.filter((w) => w.text.includes('pagination cap'))).toEqual([]);
    // ...and those FR coverage facts classify as limitations, not actions.
    expect(warnings.every((w) => w.severity === 'limitation')).toBe(true);
  });
});

describe('fetch-error warning scope (#588 clarity)', () => {
  function report(fe: any): IngestReport {
    return {
      documentCoverage: [],
      contentCompleteness: [],
      contentCompletenessByOrigin: [],
      paginationFitness: [],
      frPeriodCoverage: [],
      cpdPeriodCoverage: [],
      sourcePeriodCoverage: [],
      clOpinionCoverage: null,
      signalCoverageGaps: [],
      fetchErrors: [fe],
      warnings: [],
      warningDetails: [],
    };
  }

  it('baseline-only backlogs say so — the fetch-health bar is current-term scoped', () => {
    const warnings = collectWarningDetails(
      report({
        sourceOrigin: 'oig',
        totalIncomplete: 106,
        categories: 1,
        totalErrors: 106,
        earliestWeek: '2019-01-14',
        latestWeek: '2025-01-13',
        allBaseline: true,
      }),
    );
    const fe = warnings.find((w) => w.text.includes('incomplete fetch'))!;
    expect(fe.text).toContain(
      'all in baseline periods (2019-01-14 to 2025-01-13), current term clean',
    );
  });

  it('backlogs touching the current term carry no baseline suffix', () => {
    const warnings = collectWarningDetails(
      report({
        sourceOrigin: 'oig',
        totalIncomplete: 3,
        categories: 1,
        totalErrors: 3,
        earliestWeek: '2026-04-06',
        latestWeek: '2026-04-27',
        allBaseline: false,
      }),
    );
    const fe = warnings.find((w) => w.text.includes('incomplete fetch'))!;
    expect(fe.text).not.toContain('baseline periods');
  });
});
