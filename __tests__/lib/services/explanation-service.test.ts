import { describe, expect, it, vi } from 'vitest';
import {
  CLASS_MULTIPLIERS,
  DATA_COVERAGE_WEIGHTS,
  DECAY_HALF_LIFE_WEEKS,
  TIER_WEIGHTS,
} from '@/lib/methodology/scoring-config';

// Mock DB module — default to unavailable, override per-test
const mockIsDbAvailable = vi.fn(() => false);
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();

vi.mock('@/lib/db', () => ({
  isDbAvailable: () => mockIsDbAvailable(),
  getDb: () => ({
    select: () => {
      mockSelect();
      return {
        from: () => {
          mockFrom();
          return {
            where: (...args: unknown[]) => {
              mockWhere(...args);
              return {
                limit: (n: number) => {
                  mockLimit(n);
                  return [];
                },
                orderBy: () => {
                  mockOrderBy();
                  return {
                    limit: (n: number) => {
                      mockLimit(n);
                      return [];
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  }),
}));

// Import after mocks are set up
const { explainDocumentScore, getConfigSnapshot, getDocumentExplanation, getWeekExplanation } =
  await import('@/lib/services/explanation-service');

describe('explainDocumentScore', () => {
  const baseRow = {
    url: 'https://example.com/doc',
    title: 'Test Document',
    documentClass: 'executive_order',
    classMultiplier: 1.5,
    severityScore: 8.34,
    finalScore: 12.51,
    captureCount: 2,
    driftCount: 1,
    warningCount: 0,
    matches: [
      { keyword: 'unitary executive', tier: 'capture', weight: 4, context: '...' },
      { keyword: 'consolidate power', tier: 'capture', weight: 4, context: '...' },
      { keyword: 'restructure', tier: 'drift', weight: 2, context: '...' },
    ],
    suppressed: [
      {
        keyword: 'removal',
        tier: 'warning' as const,
        rule: 'negation: not',
        reason: 'Negation pattern "not" found near keyword',
      },
    ],
  };

  it('produces a valid DocumentExplanation', () => {
    const explanation = explainDocumentScore(baseRow);

    expect(explanation.url).toBe(baseRow.url);
    expect(explanation.title).toBe('Test Document');
    expect(explanation.documentClass).toBe('executive_order');
    expect(explanation.classMultiplier).toBe(1.5);
    expect(explanation.severityScore).toBe(8.34);
    expect(explanation.finalScore).toBe(12.51);
    expect(explanation.matches).toHaveLength(3);
    expect(explanation.suppressed).toHaveLength(1);
  });

  it('produces a human-readable formula', () => {
    const explanation = explainDocumentScore(baseRow);
    expect(explanation.formula).toContain('log2');
    expect(explanation.formula).toContain('final =');
    expect(explanation.formula).toContain('1.5');
  });

  it('calculates tier breakdown correctly', () => {
    const explanation = explainDocumentScore(baseRow);

    expect(explanation.tierBreakdown).toHaveLength(3);

    const captureBreakdown = explanation.tierBreakdown.find((t) => t.tier === 'capture')!;
    expect(captureBreakdown.count).toBe(2);
    expect(captureBreakdown.weight).toBe(TIER_WEIGHTS.capture);
    expect(captureBreakdown.contribution).toBeCloseTo(TIER_WEIGHTS.capture * Math.log2(3), 2);

    const driftBreakdown = explanation.tierBreakdown.find((t) => t.tier === 'drift')!;
    expect(driftBreakdown.count).toBe(1);
    expect(driftBreakdown.contribution).toBe(1 * TIER_WEIGHTS.drift);

    const warningBreakdown = explanation.tierBreakdown.find((t) => t.tier === 'warning')!;
    expect(warningBreakdown.count).toBe(0);
    expect(warningBreakdown.contribution).toBe(0);
  });

  it('tier breakdown contributions sum to severityScore', () => {
    const row = {
      ...baseRow,
      severityScore:
        TIER_WEIGHTS.capture * Math.log2(3) + 1 * TIER_WEIGHTS.drift + 0 * TIER_WEIGHTS.warning,
      finalScore:
        (TIER_WEIGHTS.capture * Math.log2(3) + 1 * TIER_WEIGHTS.drift + 0 * TIER_WEIGHTS.warning) *
        1.5,
    };
    const explanation = explainDocumentScore(row);

    const breakdownSum = explanation.tierBreakdown.reduce((sum, t) => sum + t.contribution, 0);
    expect(breakdownSum).toBeCloseTo(row.severityScore, 5);
  });

  it('handles zero matches', () => {
    const row = {
      ...baseRow,
      captureCount: 0,
      driftCount: 0,
      warningCount: 0,
      severityScore: 0,
      finalScore: 0,
      matches: [],
      suppressed: [],
    };
    const explanation = explainDocumentScore(row);
    expect(explanation.tierBreakdown.every((t) => t.contribution === 0)).toBe(true);
    expect(explanation.matches).toHaveLength(0);
  });

  it('defaults title to (untitled) when missing', () => {
    const row = { ...baseRow, title: undefined };
    const explanation = explainDocumentScore(row);
    expect(explanation.title).toBe('(untitled)');
  });
});

describe('getConfigSnapshot', () => {
  it('contains all expected keys', () => {
    const snapshot = getConfigSnapshot();

    expect(snapshot.tierWeights).toEqual(TIER_WEIGHTS);
    expect(snapshot.classMultipliers).toEqual(CLASS_MULTIPLIERS);
    expect(snapshot.dataCoverageWeights).toEqual(DATA_COVERAGE_WEIGHTS);
    expect(snapshot.decayHalfLifeWeeks).toBe(DECAY_HALF_LIFE_WEEKS);
    expect(snapshot.negationWindowBefore).toBeGreaterThan(0);
    expect(snapshot.negationWindowAfter).toBeGreaterThan(0);
    expect(snapshot.sourceDiversityMax).toBeGreaterThan(0);
    expect(snapshot.authorityCountMax).toBeGreaterThan(0);
    expect(snapshot.evidenceCountMax).toBeGreaterThan(0);
    expect(snapshot.keywordDensityRatio).toBeGreaterThan(0);
  });

  it('returns a copy (not a reference)', () => {
    const a = getConfigSnapshot();
    const b = getConfigSnapshot();
    expect(a).toEqual(b);
    expect(a.tierWeights).not.toBe(b.tierWeights);
  });
});

describe('getDocumentExplanation', () => {
  it('returns null when DB is not available', async () => {
    mockIsDbAvailable.mockReturnValue(false);
    const result = await getDocumentExplanation('https://example.com/doc');
    expect(result).toBeNull();
  });

  it('returns null when document not found in DB', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const result = await getDocumentExplanation('https://example.com/missing');
    expect(result).toBeNull();
    expect(mockSelect).toHaveBeenCalled();
  });
});

describe('getWeekExplanation', () => {
  it('returns null when DB is not available', async () => {
    mockIsDbAvailable.mockReturnValue(false);
    const result = await getWeekExplanation('civilService');
    expect(result).toBeNull();
  });

  it('returns null when no aggregate found in DB', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    const result = await getWeekExplanation('courts', '2025-02-03');
    expect(result).toBeNull();
    expect(mockSelect).toHaveBeenCalled();
  });
});
