import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recomputeScores } from '@/lib/cron/recompute-scores';
import { getDb, isDbAvailable } from '@/lib/db';
import { scoreDocument, storeDocumentScores } from '@/lib/services/document-scorer';
import { computeAllWeeklyAggregates, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

vi.mock('@/lib/services/document-scorer', () => ({
  scoreDocument: vi.fn(),
  storeDocumentScores: vi.fn(),
}));

vi.mock('@/lib/services/weekly-aggregator', () => ({
  computeAllWeeklyAggregates: vi.fn(),
  storeWeeklyAggregate: vi.fn(),
}));

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);
const mockScoreDocument = vi.mocked(scoreDocument);
const mockStoreDocumentScores = vi.mocked(storeDocumentScores);
const mockComputeAllWeeklyAggregates = vi.mocked(computeAllWeeklyAggregates);
const mockStoreWeeklyAggregate = vi.mocked(storeWeeklyAggregate);

function makeDocRow(id: number, category: string, title: string) {
  return {
    id,
    category,
    title,
    content: 'some content',
    url: `https://example.com/${id}`,
    sourceType: 'federal_register',
    publishedAt: new Date('2025-02-01'),
    metadata: {},
    fetchedAt: new Date(),
    contentHash: 'hash',
  };
}

function makeMockDb(batches: Array<Array<ReturnType<typeof makeDocRow>>>) {
  let callCount = 0;
  const mockQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn(() => {
      const result = batches[callCount] ?? [];
      callCount++;
      return Promise.resolve(result);
    }),
  };
  return { select: vi.fn(() => mockQuery) } as unknown as ReturnType<typeof getDb>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recomputeScores', () => {
  it('throws when database is not available', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    await expect(recomputeScores({})).rejects.toThrow('DATABASE_URL not configured');
  });

  it('processes a batch of documents and stores scores with explicit date range', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const docs = [
      makeDocRow(1, 'judicialIndependence', 'Court Order'),
      makeDocRow(2, 'judicialIndependence', 'Ruling'),
    ];
    const mockDb = makeMockDb([docs, []]);
    mockGetDb.mockReturnValue(mockDb);

    mockScoreDocument.mockReturnValue({
      documentId: 0,
      category: 'judicialIndependence',
      finalScore: 5,
      tierScores: { capture: 0, drift: 2, warning: 1 },
      classMultiplier: 1.3,
      matchedKeywords: ['court'],
      scoredAt: new Date().toISOString(),
    });
    mockStoreDocumentScores.mockResolvedValue(2);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});
    mockStoreWeeklyAggregate.mockResolvedValue(undefined as never);

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01', batchSize: 10 });

    expect(mockScoreDocument).toHaveBeenCalledTimes(2);
    expect(mockStoreDocumentScores).toHaveBeenCalledOnce();
    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledOnce();
  });

  it('defaults to analysis periods when no date args provided', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({});

    // Should run aggregation once per analysis period (4 baselines + T2 = 5)
    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledTimes(5);
  });

  it('--allDates bypasses analysis period restriction', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({ allDates: true });

    // Single pass over all documents, single aggregation call
    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledOnce();
  });

  it('scores documents in dry-run mode without storing', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const docs = [makeDocRow(1, 'judicialIndependence', 'Test Doc')];
    const mockDb = makeMockDb([docs, []]);
    mockGetDb.mockReturnValue(mockDb);

    mockScoreDocument.mockReturnValue({
      documentId: 0,
      category: 'judicialIndependence',
      finalScore: 3,
      tierScores: { capture: 0, drift: 1, warning: 1 },
      classMultiplier: 1.0,
      matchedKeywords: [],
      scoredAt: new Date().toISOString(),
    });

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01', dryRun: true });

    expect(mockScoreDocument).toHaveBeenCalledOnce();
    expect(mockStoreDocumentScores).toHaveBeenCalledTimes(0);
  });

  it('triggers weekly aggregation for explicit date range', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);

    mockComputeAllWeeklyAggregates.mockResolvedValue({
      courts: [{ category: 'judicialIndependence', weekOf: '2025-01-27', avgScore: 3 }],
    } as Record<string, Array<{ category: string; weekOf: string; avgScore: number }>>);
    mockStoreWeeklyAggregate.mockResolvedValue(undefined as never);

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01' });

    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledOnce();
    expect(mockStoreWeeklyAggregate).toHaveBeenCalledOnce();
  });

  it('skips aggregation in dry-run mode', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01', dryRun: true });

    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledTimes(0);
  });

  it('handles documents where scoreDocument returns null', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const docs = [
      makeDocRow(1, 'judicialIndependence', 'Skipped Doc'),
      makeDocRow(2, 'judicialIndependence', 'Scored Doc'),
    ];
    const mockDb = makeMockDb([docs, []]);
    mockGetDb.mockReturnValue(mockDb);

    // First doc returns null (skipped), second returns a score
    mockScoreDocument.mockReturnValueOnce(null as never).mockReturnValueOnce({
      documentId: 0,
      category: 'judicialIndependence',
      finalScore: 5,
      tierScores: { capture: 0, drift: 2, warning: 1 },
      classMultiplier: 1.3,
      matchedKeywords: ['court'],
      scoredAt: new Date().toISOString(),
    });
    mockStoreDocumentScores.mockResolvedValue(1);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01' });

    expect(mockScoreDocument).toHaveBeenCalledTimes(2);
    // Only 1 valid score stored (null scores are filtered out)
    expect(mockStoreDocumentScores).toHaveBeenCalledTimes(1);
  });

  it('processes multiple batches until empty batch is reached', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const batch1 = [makeDocRow(1, 'agencies', 'Doc 1'), makeDocRow(2, 'agencies', 'Doc 2')];
    const batch2 = [makeDocRow(3, 'agencies', 'Doc 3')];
    const mockDb = makeMockDb([batch1, batch2, []]);
    mockGetDb.mockReturnValue(mockDb);

    mockScoreDocument.mockReturnValue({
      documentId: 0,
      category: 'agencies',
      finalScore: 3,
      tierScores: { capture: 0, drift: 1, warning: 1 },
      classMultiplier: 1.0,
      matchedKeywords: [],
      scoredAt: new Date().toISOString(),
    });
    mockStoreDocumentScores.mockResolvedValue(2);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01', batchSize: 2 });

    // 3 documents across 2 batches
    expect(mockScoreDocument).toHaveBeenCalledTimes(3);
    // storeDocumentScores called once per batch with valid scores
    expect(mockStoreDocumentScores).toHaveBeenCalledTimes(2);
  });

  it('tracks per-category counts across batches', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const docs = [
      makeDocRow(1, 'judicialIndependence', 'Doc 1'),
      makeDocRow(2, 'agencies', 'Doc 2'),
      makeDocRow(3, 'judicialIndependence', 'Doc 3'),
    ];
    const mockDb = makeMockDb([docs, []]);
    mockGetDb.mockReturnValue(mockDb);

    mockScoreDocument
      .mockReturnValueOnce({
        documentId: 0,
        category: 'judicialIndependence',
        finalScore: 5,
        tierScores: { capture: 1, drift: 0, warning: 0 },
        classMultiplier: 1.3,
        matchedKeywords: [],
        scoredAt: new Date().toISOString(),
      })
      .mockReturnValueOnce({
        documentId: 0,
        category: 'agencies',
        finalScore: 0,
        tierScores: { capture: 0, drift: 0, warning: 0 },
        classMultiplier: 1.0,
        matchedKeywords: [],
        scoredAt: new Date().toISOString(),
      })
      .mockReturnValueOnce({
        documentId: 0,
        category: 'judicialIndependence',
        finalScore: 3,
        tierScores: { capture: 0, drift: 1, warning: 0 },
        classMultiplier: 1.0,
        matchedKeywords: [],
        scoredAt: new Date().toISOString(),
      });
    mockStoreDocumentScores.mockResolvedValue(3);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01' });

    expect(mockScoreDocument).toHaveBeenCalledTimes(3);
  });

  it('extracts agency from doc.metadata when present', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const doc = {
      ...makeDocRow(1, 'agencies', 'Agency Test'),
      metadata: { agency: 'Department of Justice' },
    };
    const mockDb = makeMockDb([[doc], []]);
    mockGetDb.mockReturnValue(mockDb);

    mockScoreDocument.mockReturnValue({
      documentId: 0,
      category: 'agencies',
      finalScore: 5,
      tierScores: { capture: 1, drift: 0, warning: 0 },
      classMultiplier: 1.3,
      matchedKeywords: [],
      scoredAt: new Date().toISOString(),
    });
    mockStoreDocumentScores.mockResolvedValue(1);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01' });

    // scoreDocument called — agency is extracted from metadata
    expect(mockScoreDocument).toHaveBeenCalledTimes(1);
  });

  it('handles doc with null content and null metadata', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const doc = {
      ...makeDocRow(1, 'agencies', 'No Content'),
      content: null,
      metadata: null,
      publishedAt: null,
      url: null,
    };
    const mockDb = makeMockDb([[doc], []]);
    mockGetDb.mockReturnValue(mockDb);

    mockScoreDocument.mockReturnValue({
      documentId: 0,
      category: 'agencies',
      finalScore: 0,
      tierScores: { capture: 0, drift: 0, warning: 0 },
      classMultiplier: 1.0,
      matchedKeywords: [],
      scoredAt: new Date().toISOString(),
    });
    mockStoreDocumentScores.mockResolvedValue(1);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01' });

    // Null content/metadata/url/publishedAt → scoreDocument still called
    expect(mockScoreDocument).toHaveBeenCalledTimes(1);
    expect(mockStoreDocumentScores).toHaveBeenCalledTimes(1);
  });

  it('applies category filter', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({
      from: '2025-01-20',
      to: '2025-03-01',
      category: 'judicialIndependence',
    });

    expect(mockDb.select).toHaveBeenCalled();
  });

  it('--allDates skips analysis period loop', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const docs = [makeDocRow(1, 'agencies', 'Doc')];
    const mockDb = makeMockDb([docs, []]);
    mockGetDb.mockReturnValue(mockDb);

    mockScoreDocument.mockReturnValue({
      documentId: 0,
      category: 'agencies',
      finalScore: 1,
      tierScores: { capture: 0, drift: 0, warning: 1 },
      classMultiplier: 1.0,
      matchedKeywords: [],
      scoredAt: new Date().toISOString(),
    });
    mockStoreDocumentScores.mockResolvedValue(1);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({ allDates: true });

    // allDates => single pass => single aggregate call
    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledOnce();
  });

  it('dry-run with analysis periods skips store and aggregate', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);

    await recomputeScores({ dryRun: true });

    // Dry-run with analysis periods: store and aggregate counts should be zero
    expect(mockStoreDocumentScores).toHaveBeenCalledTimes(0);
    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledTimes(0);
  });

  it('stores weekly aggregates for each analysis period category', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);

    mockComputeAllWeeklyAggregates.mockResolvedValue({
      agencies: [
        {
          category: 'agencies',
          weekOf: '2025-02-03',
          totalSeverity: 10,
          documentCount: 2,
          avgSeverityPerDoc: 5,
          captureProportion: 0,
          driftProportion: 0,
          warningProportion: 0,
          severityMix: 0,
          captureMatchCount: 0,
          driftMatchCount: 0,
          warningMatchCount: 0,
          suppressedMatchCount: 0,
          topKeywords: [],
          computedAt: new Date().toISOString(),
        },
      ],
    } as never);
    mockStoreWeeklyAggregate.mockResolvedValue(undefined as never);

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01' });

    expect(mockStoreWeeklyAggregate).toHaveBeenCalledTimes(1);
  });

  it('allSources flag is passed through to where clause', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);
    mockComputeAllWeeklyAggregates.mockResolvedValue({});

    await recomputeScores({ from: '2025-01-20', to: '2025-03-01', allSources: true });

    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledOnce();
  });
});
