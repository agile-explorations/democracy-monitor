import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(true),
  getDb: vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
  })),
}));

vi.mock('@/lib/db/schema', () => ({
  documents: {
    id: 'documents.id',
    title: 'documents.title',
    content: 'documents.content',
    embeddedAt: 'documents.embedded_at',
    embedding: 'documents.embedding',
    category: 'documents.category',
    contentType: 'documents.content_type',
  },
}));

const mockEmbedBatch = vi.fn();
vi.mock('@/lib/services/embedding-service', () => ({
  embedBatch: (...args: unknown[]) => mockEmbedBatch(...args),
  embedText: vi.fn(),
  isTokenLimitError: vi.fn().mockReturnValue(false),
}));

describe('document-embedder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default chain: select → from → where → orderBy → limit → resolves to []
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockResolvedValue([]);

    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it('returns 0 when DB is unavailable', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(false);

    const { embedUnprocessedDocuments } = await import('@/lib/services/document-embedder');
    const result = await embedUnprocessedDocuments();
    expect(result).toBe(0);
  });

  it('returns 0 when no unembedded documents exist', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);
    mockLimit.mockResolvedValue([]);

    const { embedUnprocessedDocuments } = await import('@/lib/services/document-embedder');
    const result = await embedUnprocessedDocuments();
    expect(result).toBe(0);
  });

  it('passes contentType filter condition in the where clause', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);
    mockLimit.mockResolvedValue([]);

    const { embedUnprocessedDocuments } = await import('@/lib/services/document-embedder');
    await embedUnprocessedDocuments();

    // The where clause should have been called (it filters out metadata_only)
    expect(mockWhere).toHaveBeenCalled();
  });

  it('embeds documents and updates their embedding', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    const mockDocs = [
      { id: 1, title: 'Test doc', content: 'Some content' },
      { id: 2, title: 'Another doc', content: null },
    ];
    mockLimit.mockResolvedValueOnce(mockDocs).mockResolvedValueOnce([]);

    const mockEmbeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    mockEmbedBatch.mockResolvedValue(mockEmbeddings);

    const { embedUnprocessedDocuments } = await import('@/lib/services/document-embedder');
    const result = await embedUnprocessedDocuments(50);

    expect(result).toBe(2);
  });

  describe('embedWithCap (--max-docs, #889)', () => {
    const doc = (id: number) => ({ id, title: `Doc ${id}`, content: 'body' });

    it('stops after maxDocs attempted rows and shrinks the last fetch to the remainder', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);
      // An inexhaustible population that honours the fetch limit: any fetch
      // wider than the remaining cap, or any extra fetch, inflates `attempted`.
      const pool = [doc(1), doc(2), doc(3), doc(4), doc(5)];
      mockLimit.mockImplementation(async (n: number) => pool.slice(0, n));
      mockEmbedBatch.mockImplementation(async (texts: string[]) => texts.map(() => [0.1]));

      const { embedWithCap } = await import('@/lib/services/document-embedder');
      const outcome = await embedWithCap(undefined, undefined, 3);

      expect(outcome).toEqual({ attempted: 3, embedded: 3 });
    });

    it('counts a marked failure as an attempt (every attempt is an API call)', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);
      mockLimit.mockResolvedValueOnce([doc(1), doc(2)]).mockResolvedValue([]);
      mockEmbedBatch.mockResolvedValue([[0.1], null]);

      const { embedWithCap } = await import('@/lib/services/document-embedder');
      const outcome = await embedWithCap(undefined, undefined, 10);

      expect(outcome).toEqual({ attempted: 2, embedded: 1 });
    });

    it('runs uncapped to exhaustion when maxDocs is omitted', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);
      mockLimit
        .mockResolvedValueOnce([doc(1)])
        .mockResolvedValueOnce([doc(2)])
        .mockResolvedValue([]);
      mockEmbedBatch.mockImplementation(async (texts: string[]) => texts.map(() => [0.1]));

      const { embedWithCap } = await import('@/lib/services/document-embedder');
      expect(await embedWithCap()).toEqual({ attempted: 2, embedded: 2 });
      expect(mockLimit).toHaveBeenCalledTimes(3);
    });
  });

  describe('countEmbeddable (--dry-run, #889)', () => {
    it('returns the row count and approximate token estimate as numbers', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(true);
      mockWhere.mockResolvedValueOnce([{ count: 42, approxTokens: '123456' }]);

      const { countEmbeddable } = await import('@/lib/services/document-embedder');
      expect(await countEmbeddable({ category: 'elections' })).toEqual({
        count: 42,
        approxTokens: 123456,
      });
    });

    it('is zero without a database', async () => {
      const { isDbAvailable } = await import('@/lib/db');
      vi.mocked(isDbAvailable).mockReturnValue(false);

      const { countEmbeddable } = await import('@/lib/services/document-embedder');
      expect(await countEmbeddable()).toEqual({ count: 0, approxTokens: 0 });
    });
  });
});
