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

  it('processes a batch of documents and stores scores', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const docs = [makeDocRow(1, 'courts', 'Court Order'), makeDocRow(2, 'courts', 'Ruling')];
    const mockDb = makeMockDb([docs, []]);
    mockGetDb.mockReturnValue(mockDb);

    mockScoreDocument.mockReturnValue({
      documentId: 0,
      category: 'courts',
      finalScore: 5,
      tierScores: { capture: 0, drift: 2, warning: 1 },
      classMultiplier: 1.3,
      matchedKeywords: ['court'],
      scoredAt: new Date().toISOString(),
    });
    mockStoreDocumentScores.mockResolvedValue(2);

    await recomputeScores({ batchSize: 10 });

    expect(mockScoreDocument).toHaveBeenCalledTimes(2);
    expect(mockStoreDocumentScores).toHaveBeenCalledOnce();
  });

  it('completes immediately when no documents exist', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);

    await expect(recomputeScores({})).resolves.toBeUndefined();

    // No documents means no scoring calls
    expect(mockScoreDocument).toHaveBeenCalledTimes(0);
  });

  it('scores documents in dry-run mode without storing', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const docs = [makeDocRow(1, 'courts', 'Test Doc')];
    const mockDb = makeMockDb([docs, []]);
    mockGetDb.mockReturnValue(mockDb);

    mockScoreDocument.mockReturnValue({
      documentId: 0,
      category: 'courts',
      finalScore: 3,
      tierScores: { capture: 0, drift: 1, warning: 1 },
      classMultiplier: 1.0,
      matchedKeywords: [],
      scoredAt: new Date().toISOString(),
    });

    await recomputeScores({ dryRun: true });

    // Documents are scored even in dry-run
    expect(mockScoreDocument).toHaveBeenCalledOnce();
    // But scores are not persisted (storeDocumentScores call count stays at 0)
    expect(mockStoreDocumentScores).toHaveBeenCalledTimes(0);
  });

  it('triggers weekly aggregation when aggregate flag is set', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);

    mockComputeAllWeeklyAggregates.mockResolvedValue({
      courts: [{ category: 'courts', weekOf: '2025-01-27', avgScore: 3 }],
    } as Record<string, Array<{ category: string; weekOf: string; avgScore: number }>>);
    mockStoreWeeklyAggregate.mockResolvedValue(undefined as never);

    await recomputeScores({ aggregate: true });

    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledOnce();
    expect(mockStoreWeeklyAggregate).toHaveBeenCalledOnce();
  });

  it('skips aggregation in dry-run mode even with aggregate flag', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockDb = makeMockDb([[]]);
    mockGetDb.mockReturnValue(mockDb);

    await recomputeScores({ aggregate: true, dryRun: true });

    // Aggregation is skipped in dry-run
    expect(mockComputeAllWeeklyAggregates).toHaveBeenCalledTimes(0);
  });
});
