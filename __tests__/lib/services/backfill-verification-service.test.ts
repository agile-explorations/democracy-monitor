import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDocumentCoverage,
  getStageCompleteness,
  getBaselineCompleteness,
  getLayer2Completeness,
  getPaginationFitness,
} from '@/lib/services/backfill-verification-service';

const mockSelect = vi.fn().mockReturnThis();
const mockFrom = vi.fn().mockReturnThis();
const mockWhere = vi.fn().mockReturnThis();
const mockGroupBy = vi.fn().mockReturnThis();
const mockOrderBy = vi.fn().mockReturnThis();
const mockLeftJoin = vi.fn().mockReturnThis();
const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(true),
  getDb: vi.fn(() => ({
    select: mockSelect,
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
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain to return empty arrays by default
    mockSelect.mockReturnThis();
    mockFrom.mockReturnThis();
    mockWhere.mockReturnThis();
    mockGroupBy.mockReturnThis();
    mockOrderBy.mockResolvedValue([]);
    mockLeftJoin.mockReturnThis();
    // Make the chain work
    mockSelect.mockReturnValue({
      from: mockFrom.mockReturnValue({
        where: mockWhere.mockReturnValue({
          groupBy: mockGroupBy.mockReturnValue({
            orderBy: mockOrderBy,
          }),
        }),
        leftJoin: mockLeftJoin.mockReturnValue({
          where: mockWhere,
        }),
        orderBy: mockOrderBy,
      }),
    });
  });

  it('returns empty arrays when DB is unavailable', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(false);

    expect(await getDocumentCoverage()).toEqual([]);
    expect(await getStageCompleteness()).toEqual({
      totalDocuments: 0,
      missingScores: 0,
      missingEmbeddings: 0,
      totalWeeks: 0,
      missingAggregates: 0,
    });
    expect(await getBaselineCompleteness()).toEqual([]);
    expect(await getLayer2Completeness()).toEqual({
      totalT2Documents: 0,
      missingPass1: 0,
      missingPass2: 0,
    });
    expect(await getPaginationFitness()).toEqual([]);
  });
});
