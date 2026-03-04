import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPaginationFitness,
  getFrPeriodCoverage,
  getGdeltCrossfeedCoverage,
} from '@/lib/services/backfill-source-coverage';
import {
  getDocumentCoverage,
  getStageCompleteness,
  getBaselineCompleteness,
  getLayer2Completeness,
} from '@/lib/services/backfill-verification-service';

// A chainable mock that also resolves when awaited (thenable).
// Each chain method returns the same object, and `await` resolves to `defaultValue`.
function createChainable(defaultValue: unknown = []) {
  const obj: Record<string, unknown> = {};
  for (const method of ['select', 'from', 'where', 'groupBy', 'orderBy', 'leftJoin']) {
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
    embeddedAt: 'documents.embedded_at',
    publishedAt: 'documents.published_at',
    url: 'documents.url',
    contentType: 'documents.content_type',
    content: 'documents.content',
  },
  documentScores: {
    id: 'document_scores.id',
    category: 'document_scores.category',
    weekOf: 'document_scores.week_of',
    url: 'document_scores.url',
  },
  weeklyAggregates: {
    category: 'weekly_aggregates.category',
  },
  baselines: {
    baselineId: 'baselines.baseline_id',
    category: 'baselines.category',
  },
  aiDocumentAssessments: {
    pass: 'ai_document_assessments.pass',
    url: 'ai_document_assessments.url',
    category: 'ai_document_assessments.category',
  },
}));

describe('backfill-verification-service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    chainable = createChainable([]);
    mockExecute.mockResolvedValue({ rows: [] });

    // Restore getDb to the default factory (tests that override it pollute state)
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

  it('returns empty/zero defaults when DB is unavailable', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(false);

    expect(await getDocumentCoverage()).toEqual([]);
    expect(await getStageCompleteness()).toEqual({
      totalDocuments: 0,
      missingScores: 0,
      missingEmbeddings: 0,
      metadataOnlyCount: 0,
      totalWeeks: 0,
      missingAggregates: 0,
    });
    expect(await getBaselineCompleteness()).toEqual([]);
    expect(await getLayer2Completeness()).toEqual([]);
    expect(await getPaginationFitness()).toEqual([]);
    expect(await getFrPeriodCoverage()).toEqual([]);
    expect(await getGdeltCrossfeedCoverage()).toEqual([]);
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

  describe('getStageCompleteness', () => {
    it('returns stage counts from multiple queries', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      // The function runs 4 sequential selects. Each resolves the chainable.
      // We need to return different values for each select call.
      const results = [
        [{ total: '100', missingEmbeddings: '5', metadataOnlyCount: '10' }], // docStats
        [{ missingScores: '3' }], // scoreStats
        [{ totalWeeks: '20' }], // weekStats
        [{ aggWeeks: '18' }], // aggStats
      ];
      let callIdx = 0;
      const selectFn = vi.fn().mockImplementation(() => {
        const c = createChainable(results[callIdx++] || []);
        return c;
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({ select: selectFn, execute: mockExecute } as never);

      const result = await getStageCompleteness();
      expect(result).toEqual({
        totalDocuments: 100,
        missingScores: 3,
        missingEmbeddings: 5,
        metadataOnlyCount: 10,
        totalWeeks: 20,
        missingAggregates: 2,
      });
    });
  });

  describe('getBaselineCompleteness', () => {
    it('maps rows with hasStats=true', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);
      chainable = createChainable([{ baselineId: 'biden_2022', category: 'executiveActions' }]);

      const result = await getBaselineCompleteness();
      expect(result).toEqual([
        { baselineId: 'biden_2022', category: 'executiveActions', hasStats: true },
      ]);
    });
  });

  describe('getLayer2Completeness', () => {
    it('returns per-period stats with correct pass calculations', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      // 5 periods × 4 grouped queries each = 20 select calls
      // Each period: docsByCategory, p1ByCategory, p2FlagRouteByCategory, p2AuditByCategory
      const perPeriod = [
        [
          { category: 'fiscal', total: '30' },
          { category: 'military', total: '20' },
        ],
        [
          { category: 'fiscal', total: '25', flagged: '6' },
          { category: 'military', total: '20', flagged: '4' },
        ],
        [
          { category: 'fiscal', total: '5', concerning: '2' },
          { category: 'military', total: '3', concerning: '1' },
        ],
        [
          { category: 'fiscal', sampled: '15', falseNegatives: '1' },
          { category: 'military', sampled: '15', falseNegatives: '1' },
        ],
      ];
      const allResults = Array.from({ length: 5 }, () => perPeriod).flat();
      let callIdx = 0;
      const selectFn = vi.fn().mockImplementation(() => {
        return createChainable(allResults[callIdx++] || []);
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({ select: selectFn, execute: mockExecute } as never);

      const result = await getLayer2Completeness();
      expect(result).toHaveLength(5);
      expect(result[0]).toMatchObject({
        period: 'biden_2022',
        totalDocuments: 50,
        pass1Assessed: 45,
        missingPass1: 5,
        pass1Flagged: 10,
        pass2Assessed: 38,
        missingPass2: 2,
        pass2Flagged: 5,
        auditSampled: 30,
        auditFalseNegatives: 2,
      });
      expect(result[4]).toMatchObject({ period: 'trump_t2' });
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

    it('passes category filter when provided', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);
      mockExecute.mockResolvedValue({ rows: [] });

      await getFrPeriodCoverage('civilService');
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('getGdeltCrossfeedCoverage', () => {
    it('maps raw rows to SourcePeriodCoverage with sourceOrigin=gdelt and period=all', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      mockExecute.mockResolvedValue({
        rows: [
          { category: 'civilService', count: 55 },
          { category: 'mediaFreedom', count: 30 },
        ],
      });

      const result = await getGdeltCrossfeedCoverage();
      expect(result).toEqual([
        { category: 'civilService', sourceOrigin: 'gdelt', period: 'all', count: 55 },
        { category: 'mediaFreedom', sourceOrigin: 'gdelt', period: 'all', count: 30 },
      ]);
    });
  });
});
