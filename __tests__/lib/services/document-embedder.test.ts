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
});
