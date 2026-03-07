import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getLayer2Completeness,
  getLayerScorePopulation,
  getMetadataOnlyClassification,
} from '@/lib/services/data-validation-queries';
import {
  getStageCompleteness,
  getBaselineCompleteness,
  collectWarnings,
} from '@/lib/services/data-validation-service';
import type { DataReport } from '@/lib/services/data-validation-service';

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
    sourceType: 'documents.source_type',
    embeddedAt: 'documents.embedded_at',
    publishedAt: 'documents.published_at',
    url: 'documents.url',
    contentType: 'documents.content_type',
    content: 'documents.content',
    caseId: 'documents.case_id',
  },
  documentScores: {
    id: 'document_scores.id',
    category: 'document_scores.category',
    weekOf: 'document_scores.week_of',
    url: 'document_scores.url',
  },
  weeklyAggregates: {
    category: 'weekly_aggregates.category',
    weekOf: 'weekly_aggregates.week_of',
    structuralScore: 'weekly_aggregates.structural_score',
    aiScore: 'weekly_aggregates.ai_score',
    thematicScore: 'weekly_aggregates.thematic_score',
    convergenceScore: 'weekly_aggregates.convergence_score',
  },
  baselines: {
    baselineId: 'baselines.baseline_id',
    category: 'baselines.category',
  },
  aiDocumentAssessments: {
    pass: 'ai_document_assessments.pass',
    url: 'ai_document_assessments.url',
    category: 'ai_document_assessments.category',
    weekOf: 'ai_document_assessments.week_of',
    relevant: 'ai_document_assessments.relevant',
    assessment: 'ai_document_assessments.assessment',
    isAuditSample: 'ai_document_assessments.is_audit_sample',
  },
}));

describe('data-validation-service', () => {
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

  it('returns empty/zero defaults when DB is unavailable', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(false);

    expect(await getStageCompleteness()).toEqual({
      totalDocuments: 0,
      missingScores: 0,
      missingEmbeddings: 0,
      missingEmbeddingsIntent: 0,
      metadataOnlyCount: 0,
      totalWeeks: 0,
      missingAggregates: 0,
    });
    expect(await getBaselineCompleteness()).toEqual([]);
    expect(await getLayer2Completeness()).toEqual([]);
    expect(await getLayerScorePopulation()).toEqual([]);
    expect(await getMetadataOnlyClassification()).toEqual([]);
  });

  describe('getStageCompleteness', () => {
    it('returns stage counts from multiple queries', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      const results = [
        [{ total: '100', missingEmbeddings: '5', metadataOnlyCount: '10' }],
        [{ missingScores: '3' }],
        [{ totalWeeks: '20' }],
        [{ aggWeeks: '18' }],
      ];
      let callIdx = 0;
      const selectFn = vi.fn().mockImplementation(() => {
        return createChainable(results[callIdx++] || []);
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({ select: selectFn, execute: mockExecute } as never);

      const result = await getStageCompleteness();
      expect(result).toMatchObject({
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
    it('returns per-period stats with correct structure', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      // Queries run concurrently via Promise.all, so mock returns same data for all calls
      const selectFn = vi.fn().mockImplementation(() => {
        return createChainable([
          {
            category: 'fiscal',
            total: '30',
            flagged: '6',
            concerning: '2',
            sampled: '15',
            falseNegatives: '1',
          },
        ]);
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({ select: selectFn, execute: mockExecute } as never);

      const result = await getLayer2Completeness();
      expect(result).toHaveLength(5);
      expect(result[0]).toMatchObject({ period: 'biden_2022' });
      expect(result[4]).toMatchObject({ period: 'trump_t2' });
      // All periods should have numeric fields
      for (const p of result) {
        expect(typeof p.totalDocuments).toBe('number');
        expect(typeof p.pass1Assessed).toBe('number');
        expect(typeof p.auditFalseNegatives).toBe('number');
      }
    });
  });

  describe('getLayerScorePopulation', () => {
    it('returns per-period layer score counts', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      const periodResult = [
        {
          total: '52',
          withStructural: '50',
          withAi: '48',
          withThematic: '45',
          withConvergence: '44',
          withAll: '42',
        },
      ];
      // 5 periods, each returns same data
      let callIdx = 0;
      const selectFn = vi.fn().mockImplementation(() => {
        callIdx++;
        return createChainable(periodResult);
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({ select: selectFn, execute: mockExecute } as never);

      const result = await getLayerScorePopulation();
      expect(result).toHaveLength(5);
      expect(result[0]).toMatchObject({
        period: 'biden_2022',
        totalWeeks: 52,
        withStructural: 50,
        withAi: 48,
        withThematic: 45,
        withConvergence: 44,
        withAllLayers: 42,
      });
    });
  });

  describe('getMetadataOnlyClassification', () => {
    it('returns pass when all populations are correctly classified', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      // Two select calls: CL stubs, then GDELT
      const results = [
        [{ total: '164000', marked: '164000' }],
        [{ total: '60000', marked: '60000' }],
      ];
      let callIdx = 0;
      const selectFn = vi.fn().mockImplementation(() => {
        return createChainable(results[callIdx++] || []);
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({ select: selectFn, execute: mockExecute } as never);

      const result = await getMetadataOnlyClassification();
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        population: 'CourtListener docket stubs',
        total: 164000,
        markedMetadataOnly: 164000,
        unmarked: 0,
        pass: true,
      });
      expect(result[1]).toMatchObject({
        population: 'GDELT rhetoric documents',
        total: 60000,
        markedMetadataOnly: 60000,
        unmarked: 0,
        pass: true,
      });
    });

    it('returns fail when documents are not classified', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      const results = [
        [{ total: '164000', marked: '100000' }],
        [{ total: '60000', marked: '60000' }],
      ];
      let callIdx = 0;
      const selectFn = vi.fn().mockImplementation(() => {
        return createChainable(results[callIdx++] || []);
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({ select: selectFn, execute: mockExecute } as never);

      const result = await getMetadataOnlyClassification();
      expect(result[0]).toMatchObject({
        pass: false,
        unmarked: 64000,
      });
    });
  });
});

describe('runDataValidation', () => {
  it('throws when DB is unavailable', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(false);
    const { runDataValidation } = await import('@/lib/services/data-validation-service');

    await expect(runDataValidation()).rejects.toThrow('DATABASE_URL not configured');
  });
});

describe('collectWarnings', () => {
  function emptyReport(overrides: Partial<DataReport> = {}): DataReport {
    return {
      stageCompleteness: {
        totalDocuments: 100,
        missingScores: 0,
        missingEmbeddings: 0,
        missingEmbeddingsIntent: 0,
        metadataOnlyCount: 0,
        totalWeeks: 20,
        missingAggregates: 0,
      },
      baselineCompleteness: [],
      layer2Completeness: [],
      layerScorePopulation: [],
      metadataOnlyClassification: [],
      narrativeCoverage: { elevatedWeeks: 0, narrativeWeeks: 0, missingWeeks: 0, staleWeeks: 0 },
      dataIntegrity: [],
      warnings: [],
      ...overrides,
    };
  }

  it('warns for missing scores', () => {
    const report = emptyReport({
      stageCompleteness: {
        totalDocuments: 100,
        missingScores: 15,
        missingEmbeddings: 0,
        missingEmbeddingsIntent: 0,
        metadataOnlyCount: 0,
        totalWeeks: 20,
        missingAggregates: 0,
      },
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(expect.stringContaining('15 documents need scores'));
  });

  it('warns for incomplete metadata_only classification', () => {
    const report = emptyReport({
      metadataOnlyClassification: [
        {
          population: 'CourtListener docket stubs',
          sourceFilter: { column: 'source_type', value: 'court_opinion' },
          total: 164000,
          markedMetadataOnly: 100000,
          unmarked: 64000,
          pass: false,
        },
      ],
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(expect.stringContaining('CourtListener docket stubs'));
    expect(warnings).toContainEqual(expect.stringContaining('64000'));
  });

  it('warns when no weeks have all layer scores', () => {
    const report = emptyReport({
      layerScorePopulation: [
        {
          period: 'trump_t2',
          label: 'Trump T2',
          totalWeeks: 58,
          withStructural: 58,
          withAi: 0,
          withThematic: 0,
          withConvergence: 0,
          withAllLayers: 0,
        },
      ],
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(
      expect.stringContaining('trump_t2: no weeks have all three layer scores'),
    );
  });

  it('returns no stage or layer warnings when those sections are clean', () => {
    const report = emptyReport();
    const warnings = collectWarnings(report);
    // No score, embedding, aggregate, layer, or metadata_only warnings
    // (baseline warnings are expected since the report has empty baselines)
    expect(warnings.filter((w) => w.includes('documents need'))).toEqual([]);
    expect(warnings.filter((w) => w.includes('layer scores'))).toEqual([]);
    expect(warnings.filter((w) => w.includes('metadata_only'))).toEqual([]);
  });
});
