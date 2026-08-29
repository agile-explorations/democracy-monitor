import { describe, expect, it } from 'vitest';
import battery from '@/__tests__/fixtures/hygiene-battery-2026-08-29.json';
import {
  DEFAULT_THRESHOLDS,
  diffRuns,
  gateFailures,
  isArmDoc,
  questionMetrics,
  renderRun,
  runMetrics,
} from '@/lib/utils/retrieval-hygiene';
import type { HygieneCapture, HygieneThresholds } from '@/lib/utils/retrieval-hygiene';

const captures = battery as HygieneCapture[];

describe('pool-hygiene metrics (#803) on the 2026-08-29 battery fixture', () => {
  it('reads arm docs from provenance when present, else from a zero cosine', () => {
    expect(isArmDoc({ id: 1, cosineSimilarity: 0 })).toBe(true);
    expect(isArmDoc({ id: 1, cosineSimilarity: 0.5 })).toBe(false);
    expect(isArmDoc({ id: 1, cosineSimilarity: 0.5, provenance: 'arm' })).toBe(true);
    expect(isArmDoc({ id: 1, cosineSimilarity: 0, provenance: 'seed' })).toBe(false);
  });

  it('measures the served top-10 per question', () => {
    const rl1 = questionMetrics(captures.find((c) => c.id === 'RL1')!);
    // Five alias-only notices in RL1's first ten citations (the exhibit).
    expect(rl1.top10ArmShare).toBeCloseTo(0.5, 5);
    const n06 = questionMetrics(captures.find((c) => c.id === 'N06-elections')!);
    // The analytical path carried no arm docs at all.
    expect(n06.top10ArmShare).toBe(0);
    expect(n06.top10MeanCosine).toBeGreaterThan(0.5);
  });

  it('finds the question-blind alias tail across the run', () => {
    const m = runMetrics(captures);
    const shared = m.sharedAliases.map((a) => a.alias);
    expect(shared).toContain('Public Law 119-21');
    expect(m.sharedAliases[0].questions.length).toBeGreaterThanOrEqual(
      DEFAULT_THRESHOLDS.aliasShareMin,
    );
    expect(m.emptyPools).toEqual([]);
  });

  it('gates on the thresholds and names every failure', () => {
    const m = runMetrics(captures);
    const failures = gateFailures(m);
    expect(failures.some((f) => f.startsWith('top-10 mean cosine'))).toBe(true);
    expect(failures.some((f) => f.startsWith('top-10 arm share'))).toBe(true);
    const lax: HygieneThresholds = {
      ...DEFAULT_THRESHOLDS,
      minTop10Cosine: 0,
      maxTop10ArmShare: 1,
      maxSharedAliases: 1000,
      maxRecurringDocs: 1000,
    };
    expect(gateFailures(m, lax)).toEqual([]);
    const clean = runMetrics(
      captures.map((c) => ({
        ...c,
        alsoSearched: [],
        docs: c.docs.map((d, i) => ({
          ...d,
          id: d.id * 1000 + i,
          cosineSimilarity: 0.6,
          provenance: 'seed' as const,
        })),
      })),
    );
    expect(gateFailures(clean)).toEqual([]);
  });

  it('reports empty or errored captures as gate failures', () => {
    const m = runMetrics([
      ...captures,
      { id: 'X', q: 'x', ms: null, docs: [], alsoSearched: [], strata: null, error: 'timeout' },
    ]);
    expect(m.emptyPools).toEqual(['X']);
    expect(gateFailures(m).some((f) => f.includes('empty pools: X'))).toBe(true);
  });

  it('renders and diffs without throwing', () => {
    const m = runMetrics(captures);
    expect(renderRun(m)[0]).toContain('top-10 arm share');
    const better = runMetrics(
      captures.map((c) => ({ ...c, docs: c.docs.map((d) => ({ ...d, cosineSimilarity: 0.5 })) })),
    );
    const lines = diffRuns(m, better);
    expect(lines[0]).toMatch(/top-10 arm share \d+% → 0%/);
    expect(lines.length).toBe(1 + better.questions.length);
  });
});
