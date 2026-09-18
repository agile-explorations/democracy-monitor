import { describe, expect, it } from 'vitest';
import battery from '@/__tests__/fixtures/hygiene-battery-2026-08-29.json';
import {
  DEFAULT_THRESHOLDS,
  diffRuns,
  gateFailures,
  isArmDoc,
  mergeCaptures,
  questionMetrics,
  renderRun,
  runMetrics,
} from '@/lib/utils/retrieval-hygiene';
import type { HygieneCapture, HygieneThresholds } from '@/lib/utils/retrieval-hygiene';

const captures = battery as HygieneCapture[];

/** A minimal capture with one seed doc so it counts as a non-empty pool. */
function stub(id: string, alsoSearched: string[], contributingAliases?: string[]): HygieneCapture {
  return {
    id,
    q: `question ${id}`,
    ms: 1000,
    docs: [{ id: 1, cosineSimilarity: 0.6, provenance: 'seed' }],
    alsoSearched,
    ...(contributingAliases ? { contributingAliases } : {}),
    strata: null,
  };
}

/** Five questions: "Omnibus Act" is searched on all five but contributes on
 *  only two; "Insurrection Act" is searched AND contributes on four. */
const withContributing: HygieneCapture[] = [
  stub('Q1', ['Insurrection Act', 'Omnibus Act'], ['Insurrection Act', 'Omnibus Act']),
  stub('Q2', ['Insurrection Act', 'Omnibus Act'], ['Insurrection Act', 'Omnibus Act']),
  stub('Q3', ['Insurrection Act', 'Omnibus Act'], ['Insurrection Act']),
  stub('Q4', ['Insurrection Act', 'Omnibus Act'], ['Insurrection Act']),
  stub('Q5', ['Omnibus Act'], []),
];

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

describe('contributing aliases (#910)', () => {
  it('counts only aliases that surfaced a document, within the shared set', () => {
    const m = runMetrics(withContributing);
    expect(m.sharedAliases.map((a) => a.alias)).toEqual(['Omnibus Act', 'Insurrection Act']);
    expect(m.sharedContributingAliases).toEqual([
      { alias: 'Insurrection Act', questions: ['Q1', 'Q2', 'Q3', 'Q4'] },
    ]);
    const shared = new Set(m.sharedAliases.map((a) => a.alias));
    for (const a of m.sharedContributingAliases) expect(shared.has(a.alias)).toBe(true);
  });

  it('reports none for captures predating the field, leaving shared aliases as before', () => {
    const m = runMetrics(captures);
    expect(m.sharedContributingAliases).toEqual([]);
    expect(m.sharedAliases.map((a) => a.alias)).toContain('Public Law 119-21');
    // The 6-capture fixture has nine aliases on ≥ 4 questions; the new field must not move it.
    expect(m.sharedAliases.length).toBe(9);
  });

  it('shows the searched and contributing counts side by side in reports and diffs', () => {
    const m = runMetrics(withContributing);
    expect(renderRun(m)[0]).toContain('shared aliases 2 (contributing 1)');
    // The 08-29 fixture predates the field: its side reads n/a, not 0.
    expect(diffRuns(runMetrics(captures), m)[0]).toMatch(
      /shared aliases \d+ \(contributing n\/a\) → 2 \(contributing 1\)/,
    );
  });

  it('reports n/a instead of zero when a measured capture lacks the field', () => {
    const mixed = [...withContributing.slice(0, 2), stub('old', ['x'])];
    expect(runMetrics(mixed).contributingMeasured).toBe(false);
    expect(renderRun(runMetrics(mixed))[0]).toContain('(contributing n/a)');
  });
});

describe('mergeCaptures (#908)', () => {
  const existing = [stub('A', ['x']), stub('B', ['y']), stub('C', ['z']), stub('ZZ-retired', [])];
  const freshB = { ...stub('B', ['y2']), ms: 42 };

  it('replaces the re-captured row and keeps every other row', () => {
    const merged = mergeCaptures(existing, [freshB], ['A', 'B', 'C']);
    expect(merged.map((c) => c.id)).toEqual(['A', 'B', 'C', 'ZZ-retired']);
    expect(merged.find((c) => c.id === 'B')).toEqual(freshB);
    expect(merged.find((c) => c.id === 'A')).toEqual(existing[0]);
  });

  it('orders by the bank and appends ids the bank no longer lists', () => {
    const merged = mergeCaptures(existing, [stub('D', [])], ['D', 'C', 'B', 'A']);
    expect(merged.map((c) => c.id)).toEqual(['D', 'C', 'B', 'A', 'ZZ-retired']);
  });

  it('is a plain capture when nothing existed before', () => {
    const fresh = [stub('B', []), stub('A', [])];
    expect(mergeCaptures([], fresh, ['A', 'B']).map((c) => c.id)).toEqual(['A', 'B']);
  });
});
