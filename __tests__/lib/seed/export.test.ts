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

const { exportSeedData } = await import('@/lib/seed/export');

describe('exportSeedData', () => {
  const testDir = path.join(__dirname, 'test-fixtures-export');

  function mockDb(rows: Record<string, unknown>[] = []) {
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue(rows),
    });
    const mockExecute = vi.fn().mockResolvedValue({ rows });
    mockGetDb.mockReturnValue({ select: mockSelect, execute: mockExecute } as never);
    return { mockSelect, mockExecute };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('throws when DATABASE_URL is not configured', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    await expect(exportSeedData(testDir)).rejects.toThrow('DATABASE_URL not configured');
  });

  it('creates output directory if it does not exist', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockDb();

    await exportSeedData(testDir);

    expect(fs.existsSync(testDir)).toBe(true);
  });

  it('exports each table and manifest as JSON fixture files', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const mockRows = [{ id: 1, category: 'courts', status: 'Stable' }];
    mockDb(mockRows);

    await exportSeedData(testDir);

    const expectedFiles = [
      'assessments.json',
      'baselines.json',
      'document_scores.json',
      'weekly_aggregates.json',
      'intent_weekly.json',
      'document_manifest.json',
    ];

    for (const file of expectedFiles) {
      const filePath = path.join(testDir, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.metadata).toBeDefined();
      expect(content.metadata.table).toBeDefined();
      expect(content.metadata.rowCount).toBe(1);
      expect(content.metadata.exportedAt).toBeDefined();
      expect(content.rows).toHaveLength(1);
    }
  });

  it('writes valid JSON with metadata and rows', async () => {
    mockIsDbAvailable.mockReturnValue(true);

    const testRow = { id: 42, category: 'military', status: 'Warning', reason: 'Test' };
    mockDb([testRow]);

    await exportSeedData(testDir);

    const content = JSON.parse(fs.readFileSync(path.join(testDir, 'assessments.json'), 'utf-8'));
    expect(content.rows[0]).toEqual(testRow);
    expect(content.metadata.table).toBe('assessments');
  });

  it('handles empty tables gracefully', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockDb([]);

    await exportSeedData(testDir);

    const content = JSON.parse(fs.readFileSync(path.join(testDir, 'assessments.json'), 'utf-8'));
    expect(content.metadata.rowCount).toBe(0);
    expect(content.rows).toEqual([]);
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});
