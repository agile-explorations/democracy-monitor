import { describe, it, expect } from 'vitest';
import type { AssessmentRow } from '@/lib/services/snapshot-store';
import { buildSnapshotRow, rowToAssessment } from '@/lib/services/snapshot-store';
import type { EnhancedAssessment } from '@/lib/types';

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

function makeRow(overrides: Partial<AssessmentRow> = {}): AssessmentRow {
  return {
    id: 1,
    category: 'rule_of_law',
    status: 'Warning',
    reason: 'Test reason',
    matches: ['keyword1'],
    detail: null,
    confidence: 60,
    ...overrides,
  };
}

describe('buildSnapshotRow', () => {
  it('maps assessment fields to row values', () => {
    const assessment = makeAssessment();
    const row = buildSnapshotRow(assessment);

    expect(row.category).toBe('rule_of_law');
    expect(row.status).toBe('Warning');
    expect(row.reason).toBe('Test reason');
    expect(row.matches).toEqual(['keyword1']);
  });

  it('stores full assessment blob in detail column', () => {
    const assessment = makeAssessment({ dataCoverage: 0.8 });
    const row = buildSnapshotRow(assessment);

    const detail = row.detail as Record<string, unknown>;
    expect(detail.category).toBe('rule_of_law');
    expect(detail.dataCoverage).toBe(0.8);
  });

  it('converts dataCoverage to integer confidence', () => {
    expect(buildSnapshotRow(makeAssessment({ dataCoverage: 0.75 })).confidence).toBe(75);
    expect(buildSnapshotRow(makeAssessment({ dataCoverage: 0.333 })).confidence).toBe(33);
    expect(buildSnapshotRow(makeAssessment({ dataCoverage: 0 })).confidence).toBeNull();
  });

  it('extracts AI provider when present', () => {
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
    expect(buildSnapshotRow(assessment).aiProvider).toBe('anthropic');
  });

  it('sets aiProvider to null when no AI result', () => {
    expect(buildSnapshotRow(makeAssessment()).aiProvider).toBeNull();
  });

  it('uses provided date when given', () => {
    const date = new Date('2026-01-15T06:00:00.000Z');
    expect(buildSnapshotRow(makeAssessment(), date).assessedAt).toEqual(date);
  });
});

describe('rowToAssessment', () => {
  it('reconstructs assessment from detail blob when present', () => {
    const storedAssessment = makeAssessment({ category: 'elections', status: 'Drift' });
    const row = makeRow({
      detail: storedAssessment as unknown as Record<string, unknown>,
      assessed_at: new Date('2026-02-01T00:00:00.000Z'),
    });

    const result = rowToAssessment(row);

    expect(result).not.toBeNull();
    expect(result!.category).toBe('elections');
    expect(result!.status).toBe('Drift');
    expect(result!.dataCoverage).toBe(0.6);
    expect(result!.assessedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('overrides assessedAt with DB timestamp', () => {
    const storedAssessment = makeAssessment({ assessedAt: '2026-01-01T00:00:00.000Z' });
    const row = makeRow({
      detail: storedAssessment as unknown as Record<string, unknown>,
      assessed_at: new Date('2026-02-15T12:00:00.000Z'),
    });

    const result = rowToAssessment(row);

    expect(result!.assessedAt).toBe('2026-02-15T12:00:00.000Z');
  });

  it('falls back to column-based reconstruction when detail lacks category', () => {
    const row = makeRow({
      category: 'civil_liberties',
      status: 'Stable',
      reason: 'Looks good',
      matches: ['transparency'],
      detail: { someOtherData: true },
      confidence: 80,
    });

    const result = rowToAssessment(row);

    expect(result).not.toBeNull();
    expect(result!.category).toBe('civil_liberties');
    expect(result!.status).toBe('Stable');
    expect(result!.reason).toBe('Looks good');
    expect(result!.matches).toEqual(['transparency']);
    expect(result!.dataCoverage).toBe(0.8);
  });

  it('falls back when detail is null', () => {
    const row = makeRow({ detail: null, confidence: 50 });

    const result = rowToAssessment(row);

    expect(result).not.toBeNull();
    expect(result!.dataCoverage).toBe(0.5);
    expect(result!.evidenceFor).toEqual([]);
    expect(result!.evidenceAgainst).toEqual([]);
  });

  it('sets dataCoverage to 0 when confidence is null', () => {
    const row = makeRow({ detail: null, confidence: null });

    const result = rowToAssessment(row);

    expect(result!.dataCoverage).toBe(0);
  });

  it('preserves deep analysis fields from detail blob', () => {
    const storedAssessment = makeAssessment({
      debate: { topic: 'test', rounds: [], conclusion: 'Done', status: 'Drift' },
      legalAnalysis: {
        category: 'rule_of_law',
        status: 'Drift',
        analyses: [],
        summary: 'Summary',
      },
      trendAnomalies: [],
    });
    const row = makeRow({
      detail: storedAssessment as unknown as Record<string, unknown>,
    });

    const result = rowToAssessment(row);

    expect(result!.debate).toBeDefined();
    expect(result!.debate!.conclusion).toBe('Done');
    expect(result!.legalAnalysis).toBeDefined();
    expect(result!.trendAnomalies).toEqual([]);
  });
});
