import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(true),
  getDb: vi.fn(() => ({
    select: mockSelect,
    delete: mockDelete,
  })),
}));

vi.mock('@/lib/db/schema', () => ({
  documents: {
    category: 'documents.category',
    publishedAt: 'documents.published_at',
    contentType: 'documents.content_type',
  },
  aiDocumentAssessments: {},
}));

const mockRunLayer2Assessment = vi.fn().mockResolvedValue({ totalDocuments: 0, flagCount: 0 });
const mockRetryMissingPass2 = vi.fn().mockResolvedValue(0);
vi.mock('@/lib/services/document-review-orchestrator', () => ({
  runLayer2Assessment: (...args: unknown[]) => mockRunLayer2Assessment(...args),
  retryMissingPass2: (...args: unknown[]) => mockRetryMissingPass2(...args),
}));

vi.mock('@/lib/services/document-review-store', () => ({
  getExistingPass1Urls: vi.fn().mockResolvedValue(new Set()),
}));

describe('backfill-document-review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: select returns empty (no docs for any week)
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
    mockDelete.mockResolvedValue(undefined);
  });

  it('--fresh without --confirm returns early without processing', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    vi.spyOn(console, 'error').mockImplementation(() => {});

    let deleteCount = 0;
    let assessmentCount = 0;
    mockDelete.mockImplementation(() => {
      deleteCount++;
      return Promise.resolve();
    });
    mockRunLayer2Assessment.mockImplementation(() => {
      assessmentCount++;
      return Promise.resolve({ totalDocuments: 0, flagCount: 0 });
    });

    const { runBackfillLayer2 } = await import('@/lib/cron/backfill-document-review');
    await runBackfillLayer2({
      from: '2025-01-20',
      to: '2025-01-27',
      fresh: true,
      confirm: false,
      dryRun: false,
    });

    // Neither delete nor assessment should have run (early return)
    expect(deleteCount).toBe(0);
    expect(assessmentCount).toBe(0);
  });

  it('--fresh --confirm deletes all ai_document_assessments before processing', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    vi.spyOn(console, 'log').mockImplementation(() => {});

    let deleteCallOrder = -1;
    let assessmentCallOrder = -1;
    let callCounter = 0;
    mockDelete.mockImplementation(() => {
      deleteCallOrder = callCounter++;
      return Promise.resolve();
    });
    mockRunLayer2Assessment.mockImplementation(() => {
      assessmentCallOrder = callCounter++;
      return Promise.resolve({ totalDocuments: 0, flagCount: 0 });
    });

    const { runBackfillLayer2 } = await import('@/lib/cron/backfill-document-review');
    await runBackfillLayer2({
      from: '2025-01-20',
      to: '2025-01-27',
      fresh: true,
      confirm: true,
      dryRun: false,
    });

    // Delete should have been called before any assessments
    expect(deleteCallOrder).toBeGreaterThanOrEqual(0);
    if (assessmentCallOrder >= 0) {
      expect(deleteCallOrder).toBeLessThan(assessmentCallOrder);
    }
  });

  it('throws when database is not available', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(false);

    const { runBackfillLayer2 } = await import('@/lib/cron/backfill-document-review');
    await expect(
      runBackfillLayer2({
        from: '2025-01-20',
        to: '2025-01-27',
        fresh: false,
        confirm: false,
        dryRun: false,
      }),
    ).rejects.toThrow('Database not available');
  });

  it('defaults to analysis periods when no date args provided', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runBackfillLayer2 } = await import('@/lib/cron/backfill-document-review');
    // Should not throw — previously this would throw "Provide --baseline or --from/--to"
    await expect(
      runBackfillLayer2({
        fresh: false,
        confirm: false,
        dryRun: false,
      }),
    ).resolves.toBeUndefined();
  });
});
