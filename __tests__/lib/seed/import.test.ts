import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

vi.mock('@/lib/db/schema', () => ({
  assessments: { _: 'assessments' },
  baselines: { _: 'baselines' },
  documents: { _: 'documents' },
  documentScores: { _: 'document_scores' },
  weeklyAggregates: { _: 'weekly_aggregates' },
  intentWeekly: { _: 'intent_weekly' },
}));

const { isDbAvailable, getDb } = await import('@/lib/db');
const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);

const { importSeedData } = await import('@/lib/seed/import');

function writeFixture(dir: string, name: string, rows: Record<string, unknown>[]) {
  fs.writeFileSync(
    path.join(dir, `${name}.json`),
    JSON.stringify({
      metadata: { table: name, rowCount: rows.length, exportedAt: '2026-01-01T00:00:00Z' },
      rows,
    }),
  );
}

describe('importSeedData', () => {
  const testDir = path.join(__dirname, 'test-fixtures-import');

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  it('throws when DATABASE_URL is not configured', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    await expect(importSeedData(testDir)).rejects.toThrow('DATABASE_URL not configured');
  });

  it('throws when fixture directory does not exist', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    await expect(importSeedData('/nonexistent/path')).rejects.toThrow(
      'Fixture directory not found',
    );
  });

  it('skips tables without fixture files', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    mockGetDb.mockReturnValue({ insert: mockInsert } as never);

    // Write only one fixture — documents and others are missing
    writeFixture(testDir, 'assessments', [{ id: 1, category: 'courts', status: 'Stable' }]);

    await importSeedData(testDir);

    // Only one insert call for assessments (documents comes first in order but has no fixture)
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('imports fixture rows and strips id field', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    mockGetDb.mockReturnValue({ insert: mockInsert } as never);

    writeFixture(testDir, 'assessments', [
      { id: 1, category: 'courts', status: 'Stable', reason: 'test' },
      { id: 2, category: 'military', status: 'Warning', reason: 'test2' },
    ]);

    await importSeedData(testDir);

    expect(mockInsert).toHaveBeenCalled();
    // Verify ids were stripped from the values
    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues[0]).not.toHaveProperty('id');
    expect(insertedValues[0]).toHaveProperty('category', 'courts');
    expect(insertedValues[1]).not.toHaveProperty('id');
    expect(insertedValues[1]).toHaveProperty('category', 'military');
  });

  it('uses onConflictDoNothing for idempotency', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    mockGetDb.mockReturnValue({ insert: mockInsert } as never);

    writeFixture(testDir, 'documents', [{ id: 1, title: 'Test', url: 'https://example.com' }]);

    await importSeedData(testDir);

    expect(mockOnConflict).toHaveBeenCalled();
  });

  it('handles empty fixture rows', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const mockInsert = vi.fn();
    mockGetDb.mockReturnValue({ insert: mockInsert } as never);

    writeFixture(testDir, 'assessments', []);

    await importSeedData(testDir);

    // No insert call for empty rows
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('imports in correct order (documents before document_scores)', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const insertOrder: string[] = [];
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
    const mockInsert = vi.fn().mockImplementation((table) => {
      insertOrder.push(table._);
      return { values: mockValues };
    });
    mockGetDb.mockReturnValue({ insert: mockInsert } as never);

    writeFixture(testDir, 'documents', [{ id: 1, title: 'Doc' }]);
    writeFixture(testDir, 'document_scores', [{ id: 1, url: 'https://example.com' }]);

    await importSeedData(testDir);

    const docsIdx = insertOrder.indexOf('documents');
    const scoresIdx = insertOrder.indexOf('document_scores');
    expect(docsIdx).toBeLessThan(scoresIdx);
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});
