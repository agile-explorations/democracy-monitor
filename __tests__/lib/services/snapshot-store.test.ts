import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnhancedAssessment } from '@/lib/services/ai-assessment-service';
import { saveSnapshot, getLatestSnapshot, getLatestSnapshots } from '@/lib/services/snapshot-store';

// Mock Drizzle DB
const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};
const mockSelect = vi.fn().mockReturnValue(mockSelectChain);
const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    insert: mockInsert,
    select: mockSelect,
    execute: mockExecute,
  }),
}));

vi.mock('@/lib/db/schema', () => ({
  assessments: { category: 'category', assessedAt: 'assessed_at' },
}));

vi.mock('drizzle-orm', () => ({
  desc: vi.fn((col) => col),
  eq: vi.fn((col, val) => ({ col, val })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s },
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectChain.limit.mockResolvedValue([]);
  mockExecute.mockResolvedValue({ rows: [] });
});

function makeAssessment(overrides: Partial<EnhancedAssessment> = {}): EnhancedAssessment {
  return {
    category: 'rule_of_law',
    status: 'Warning',
    reason: 'Test reason',
    matches: ['keyword1'],
    dataCoverage: 0.6,
    evidenceFor: [],
    evidenceAgainst: [],
    howWeCouldBeWrong: [],
    keywordResult: { status: 'Warning', reason: 'Test', matches: [] },
    assessedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('saveSnapshot', () => {
  it('inserts assessment into the database', async () => {
    const assessment = makeAssessment();
    const valuesCall = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: valuesCall });

    await saveSnapshot(assessment);

    expect(mockInsert).toHaveBeenCalled();
    expect(valuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rule_of_law',
        status: 'Warning',
        reason: 'Test reason',
        matches: ['keyword1'],
      }),
    );
  });

  it('uses provided assessedAt date when given', async () => {
    const assessment = makeAssessment();
    const customDate = new Date('2026-01-15T06:00:00.000Z');
    const valuesCall = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: valuesCall });

    await saveSnapshot(assessment, customDate);

    const insertedValues = valuesCall.mock.calls[0][0];
    expect(insertedValues.assessedAt).toEqual(customDate);
  });

  it('stores dataCoverage as integer confidence', async () => {
    const assessment = makeAssessment({ dataCoverage: 0.75 });
    const valuesCall = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: valuesCall });

    await saveSnapshot(assessment);

    const insertedValues = valuesCall.mock.calls[0][0];
    expect(insertedValues.confidence).toBe(75);
  });

  it('stores AI provider when present', async () => {
    const assessment = makeAssessment({
      aiResult: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        status: 'Warning',
        reasoning: 'test',
        confidence: 0.8,
        tokensUsed: { input: 100, output: 50 },
        latencyMs: 1200,
      },
    });
    const valuesCall = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValueOnce({ values: valuesCall });

    await saveSnapshot(assessment);

    const insertedValues = valuesCall.mock.calls[0][0];
    expect(insertedValues.aiProvider).toBe('anthropic');
  });
});

describe('getLatestSnapshot', () => {
  it('returns null when no rows exist', async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]);

    const result = await getLatestSnapshot('rule_of_law');

    expect(result).toBeNull();
  });

  it('reconstructs assessment from detail blob', async () => {
    const storedAssessment = makeAssessment();
    mockSelectChain.limit.mockResolvedValueOnce([
      {
        id: 1,
        category: 'rule_of_law',
        status: 'Warning',
        reason: 'Test reason',
        matches: ['keyword1'],
        detail: storedAssessment,
        assessed_at: new Date('2026-02-01T00:00:00.000Z'),
        confidence: 60,
      },
    ]);

    const result = await getLatestSnapshot('rule_of_law');

    expect(result).not.toBeNull();
    expect(result!.category).toBe('rule_of_law');
    expect(result!.status).toBe('Warning');
    expect(result!.assessedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('falls back to column-based reconstruction when detail lacks category', async () => {
    mockSelectChain.limit.mockResolvedValueOnce([
      {
        id: 1,
        category: 'civil_liberties',
        status: 'Stable',
        reason: 'Looks good',
        matches: [],
        detail: { someOtherData: true }, // no 'category' field
        assessed_at: new Date('2026-02-01T00:00:00.000Z'),
        confidence: 80,
      },
    ]);

    const result = await getLatestSnapshot('civil_liberties');

    expect(result).not.toBeNull();
    expect(result!.category).toBe('civil_liberties');
    expect(result!.status).toBe('Stable');
    expect(result!.dataCoverage).toBe(0.8); // 80/100
  });
});

describe('getLatestSnapshots', () => {
  it('returns empty object when no rows exist', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });

    const result = await getLatestSnapshots();

    expect(result).toEqual({});
  });

  it('returns map of category -> assessment', async () => {
    const assessment1 = makeAssessment({ category: 'rule_of_law' });
    const assessment2 = makeAssessment({ category: 'civil_liberties', status: 'Stable' });

    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          category: 'rule_of_law',
          status: 'Warning',
          reason: 'Test',
          matches: [],
          detail: assessment1,
          assessed_at: new Date('2026-02-01'),
          confidence: 60,
        },
        {
          id: 2,
          category: 'civil_liberties',
          status: 'Stable',
          reason: 'Good',
          matches: [],
          detail: assessment2,
          assessed_at: new Date('2026-02-01'),
          confidence: 80,
        },
      ],
    });

    const result = await getLatestSnapshots();

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['rule_of_law'].status).toBe('Warning');
    expect(result['civil_liberties'].status).toBe('Stable');
  });
});
