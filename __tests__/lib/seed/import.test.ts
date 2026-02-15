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
  documentScores: { _: 'document_scores' },
  weeklyAggregates: { _: 'weekly_aggregates' },
  intentWeekly: { _: 'intent_weekly' },
}));

const { isDbAvailable, getDb } = await import('@/lib/db');
const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);

const { importSeedData } = await import('@/lib/seed/import');

/** Tracks what was inserted so tests can inspect DB writes as output. */
let insertedRows: { table: string; rows: Record<string, unknown>[] }[] = [];

function setupMockDb() {
  insertedRows = [];
  const mockOnConflict = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn().mockImplementation((batch: Record<string, unknown>[]) => {
    // Record what was actually passed to the DB
    const lastInsert = insertedRows[insertedRows.length - 1];
    lastInsert.rows.push(...batch);
    return { onConflictDoNothing: mockOnConflict };
  });
  const mockInsert = vi.fn().mockImplementation((table: { _: string }) => {
    insertedRows.push({ table: table._, rows: [] });
    return { values: mockValues };
  });
  mockGetDb.mockReturnValue({ insert: mockInsert } as never);
}

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
    setupMockDb();

    // Write only one fixture — others are missing
    writeFixture(testDir, 'assessments', [{ id: 1, category: 'courts', status: 'Stable' }]);

    await importSeedData(testDir);

    // Only assessments was inserted
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].table).toBe('assessments');
  });

  it('strips id field from imported rows', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    setupMockDb();

    writeFixture(testDir, 'assessments', [
      { id: 1, category: 'courts', status: 'Stable', reason: 'test' },
      { id: 2, category: 'military', status: 'Warning', reason: 'test2' },
    ]);

    await importSeedData(testDir);

    const assessmentInsert = insertedRows.find((r) => r.table === 'assessments');
    expect(assessmentInsert).toBeDefined();
    expect(assessmentInsert!.rows[0]).not.toHaveProperty('id');
    expect(assessmentInsert!.rows[0]).toHaveProperty('category', 'courts');
    expect(assessmentInsert!.rows[1]).not.toHaveProperty('id');
    expect(assessmentInsert!.rows[1]).toHaveProperty('category', 'military');
  });

  it('does not insert anything for empty fixture rows', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    setupMockDb();

    writeFixture(testDir, 'assessments', []);

    await importSeedData(testDir);

    // No tables were inserted into
    expect(insertedRows).toHaveLength(0);
  });

  it('imports assessments before document_scores', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    setupMockDb();

    writeFixture(testDir, 'assessments', [{ id: 1, category: 'courts', status: 'Stable' }]);
    writeFixture(testDir, 'document_scores', [{ id: 1, url: 'https://example.com' }]);

    await importSeedData(testDir);

    const tableOrder = insertedRows.map((r) => r.table);
    const assessIdx = tableOrder.indexOf('assessments');
    const scoresIdx = tableOrder.indexOf('document_scores');
    expect(assessIdx).toBeLessThan(scoresIdx);
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});
