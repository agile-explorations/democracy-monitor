import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDbAvailable, getDb } from '@/lib/db';
import { retrieveRelevantDocuments } from '@/lib/services/document-retriever';
import { embedText } from '@/lib/services/embedding-service';

// Mock external boundaries
vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('@/lib/services/embedding-service', () => ({
  embedText: vi.fn(),
}));

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);
const mockEmbedText = vi.mocked(embedText);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('retrieveRelevantDocuments', () => {
  it('normalizes a string category to an array', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    mockGetDb.mockReturnValue({ execute: mockExecute } as never);

    await retrieveRelevantDocuments('test query', 'rule_of_law', 5);

    // Verify the SQL was called (execute was invoked)
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('accepts an array of categories', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    mockGetDb.mockReturnValue({ execute: mockExecute } as never);

    await retrieveRelevantDocuments('test query', ['rule_of_law', 'intent'], 8);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    const result = await retrieveRelevantDocuments('test', 'rule_of_law');

    expect(result).toEqual([]);
  });

  it('returns empty array when embedding fails', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockEmbedText.mockResolvedValue(null);

    const result = await retrieveRelevantDocuments('test', ['rule_of_law', 'intent']);

    expect(result).toEqual([]);
  });

  it('returns empty array on DB query error', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    const mockExecute = vi.fn().mockRejectedValue(new Error('DB error'));
    mockGetDb.mockReturnValue({ execute: mockExecute } as never);

    const result = await retrieveRelevantDocuments('test', 'rule_of_law');

    expect(result).toEqual([]);
  });

  it('maps rows to RetrievedDocument objects', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [
        {
          title: 'Test Doc',
          content: 'Some content',
          url: 'https://example.com',
          published_at: '2026-01-15T00:00:00.000Z',
          similarity: 0.85,
        },
      ],
    });
    mockGetDb.mockReturnValue({ execute: mockExecute } as never);

    const result = await retrieveRelevantDocuments('test', 'intent', 5);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Doc');
    expect(result[0].content).toBe('Some content');
    expect(result[0].url).toBe('https://example.com');
    expect(result[0].similarity).toBe(0.85);
    expect(result[0].publishedAt).toEqual(new Date('2026-01-15T00:00:00.000Z'));
  });
});
