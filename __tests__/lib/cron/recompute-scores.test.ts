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
});
