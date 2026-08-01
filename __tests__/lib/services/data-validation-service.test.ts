import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getLayer2Completeness,
  getLayerScorePopulation,
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

  describe('getStageCompleteness with category filter', () => {
    it('passes category filter to the query', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);

      const results = [
        [
          {
            total: '50',
            missingEmbeddings: '2',
            missingEmbeddingsIntent: '1',
            metadataOnlyCount: '5',
          },
        ],
        [{ missingScores: '1' }],
        [{ totalWeeks: '10' }],
        [{ aggWeeks: '10' }],
      ];
      let callIdx = 0;
      const selectFn = vi.fn().mockImplementation(() => {
        return createChainable(results[callIdx++] || []);
      });

      const { getDb } = await import('@/lib/db');
      vi.mocked(getDb).mockReturnValue({ select: selectFn, execute: mockExecute } as never);

      const result = await getStageCompleteness('judicialIndependence');
      expect(result).toMatchObject({
        totalDocuments: 50,
        missingScores: 1,
        missingEmbeddings: 2,
        missingEmbeddingsIntent: 1,
        totalWeeks: 10,
        missingAggregates: 0,
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
      expect(result).toHaveLength(9);
      expect(result[0]).toMatchObject({ period: 'biden_2022' });
      expect(result[8]).toMatchObject({ period: 'trump_t2' });
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
      expect(result).toHaveLength(9);
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
      narrativeCoverage: { elevatedWeeks: 0, narrativeWeeks: 0, missingWeeks: 0 },
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

  it('warns for missing embeddings', () => {
    const report = emptyReport({
      stageCompleteness: {
        totalDocuments: 100,
        missingScores: 0,
        missingEmbeddings: 7,
        missingEmbeddingsIntent: 0,
        metadataOnlyCount: 0,
        totalWeeks: 20,
        missingAggregates: 0,
      },
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(
      expect.stringContaining('7 detection documents need embedding'),
    );
  });

  // Aggregate presence moved to the Derivation Graph (G2a) in #647; Data
  // Readiness no longer emits a "weeks need aggregates" warning.

  it('warns for layer2 missing pass1 docs', () => {
    const report = emptyReport({
      layer2Completeness: [
        {
          period: 'biden_2022',
          label: 'Biden 2022–23',
          totalDocuments: 100,
          pass1Assessed: 90,
          missingPass1: 10,
          pass1Flagged: 5,
          pass2Assessed: 5,
          missingPass2: 0,
          pass2Flagged: 2,
          auditSampled: 5,
          auditFalseNegatives: 0,
        },
      ],
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(
      expect.stringContaining('biden_2022: 10 docs missing L2 Pass 1'),
    );
  });

  it('warns for layer2 missing pass2 docs', () => {
    const report = emptyReport({
      layer2Completeness: [
        {
          period: 'trump_t2',
          label: 'Trump T2',
          totalDocuments: 200,
          pass1Assessed: 200,
          missingPass1: 0,
          pass1Flagged: 20,
          pass2Assessed: 15,
          missingPass2: 5,
          pass2Flagged: 3,
          auditSampled: 10,
          auditFalseNegatives: 0,
        },
      ],
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(
      expect.stringContaining('trump_t2: 5 flagged docs missing L2 Pass 2'),
    );
  });

  it('warns for layer2 audit false negatives with rate', () => {
    const report = emptyReport({
      layer2Completeness: [
        {
          period: 'biden_2021',
          label: 'Biden 2021–22',
          totalDocuments: 100,
          pass1Assessed: 100,
          missingPass1: 0,
          pass1Flagged: 10,
          pass2Assessed: 15,
          missingPass2: 0,
          pass2Flagged: 5,
          auditSampled: 20,
          auditFalseNegatives: 3,
        },
      ],
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(
      expect.stringContaining('biden_2021: 3/20 audit false negatives (15.0%)'),
    );
  });

  it('warns when some but not all weeks have layer scores', () => {
    const report = emptyReport({
      layerScorePopulation: [
        {
          period: 'biden_2022',
          label: 'Biden 2022–23',
          totalWeeks: 52,
          withStructural: 52,
          withAi: 50,
          withThematic: 48,
          withConvergence: 45,
          withAllLayers: 40,
        },
      ],
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(
      expect.stringContaining('biden_2022: 40/52 weeks have all layer scores (77%)'),
    );
  });

  it('does not warn for layer scores when totalWeeks is 0', () => {
    const report = emptyReport({
      layerScorePopulation: [
        {
          period: 'biden_2022',
          label: 'Biden 2022–23',
          totalWeeks: 0,
          withStructural: 0,
          withAi: 0,
          withThematic: 0,
          withConvergence: 0,
          withAllLayers: 0,
        },
      ],
    });
    const warnings = collectWarnings(report);
    expect(warnings.filter((w) => w.includes('layer scores'))).toEqual([]);
  });

  it('does not warn for layer scores when all weeks have all layers', () => {
    const report = emptyReport({
      layerScorePopulation: [
        {
          period: 'trump_t2',
          label: 'Trump T2',
          totalWeeks: 10,
          withStructural: 10,
          withAi: 10,
          withThematic: 10,
          withConvergence: 10,
          withAllLayers: 10,
        },
      ],
    });
    const warnings = collectWarnings(report);
    expect(warnings.filter((w) => w.includes('layer scores'))).toEqual([]);
  });

  it('warns for missing narratives', () => {
    const report = emptyReport({
      narrativeCoverage: {
        elevatedWeeks: 10,
        narrativeWeeks: 7,
        missingWeeks: 3,
        weeksWithNarratives: 7,
        weeksWithSummary: 7,
        termSummaryFresh: false,
        missingSummaryWeeks: 0,
      },
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(
      expect.stringContaining('3 elevated category-weeks missing narratives'),
    );
  });

  it('warns for missing weekly summaries', () => {
    const report = emptyReport({
      narrativeCoverage: {
        elevatedWeeks: 5,
        narrativeWeeks: 5,
        missingWeeks: 0,
        weeksWithNarratives: 5,
        weeksWithSummary: 3,
        termSummaryFresh: false,
        missingSummaryWeeks: 2,
      },
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(
      expect.stringContaining('2 narrated weeks missing weekly summaries'),
    );
  });

  // Narrative staleness moved to the Derivation Graph (G4/G4h) in #647; Data
  // Readiness no longer emits a stale-narrative warning (it was a computed_at phantom).

  // Data-integrity checks (non-Monday anchors, orphan categories, #544
  // resurrection) moved to the Derivation Graph in #647; Data Readiness no
  // longer carries a dataIntegrity section. Orphan-category coverage now lives
  // in validate-graph.test.ts (findOrphanCategories / G6).

  it('combines multiple warning sources simultaneously', () => {
    const report = emptyReport({
      stageCompleteness: {
        totalDocuments: 100,
        missingScores: 5,
        missingEmbeddings: 3,
        missingEmbeddingsIntent: 0,
        metadataOnlyCount: 0,
        totalWeeks: 20,
        missingAggregates: 2,
      },
      narrativeCoverage: {
        elevatedWeeks: 10,
        narrativeWeeks: 8,
        missingWeeks: 2,
        weeksWithNarratives: 8,
        weeksWithSummary: 7,
        termSummaryFresh: false,
        missingSummaryWeeks: 1,
      },
    });
    const warnings = collectWarnings(report);
    expect(warnings).toContainEqual(expect.stringContaining('5 documents need scores'));
    expect(warnings).toContainEqual(
      expect.stringContaining('3 detection documents need embedding'),
    );
    expect(warnings).toContainEqual(expect.stringContaining('2 elevated category-weeks missing'));
    expect(warnings).toContainEqual(expect.stringContaining('1 narrated weeks missing'));
  });
});
