import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEALTH_THRESHOLDS,
  evaluateCategoryHealth,
} from '@/lib/services/category-health-checks';
import type { CategoryHealthInputs } from '@/lib/services/category-health-checks';

const base: CategoryHealthInputs = {
  category: 'rulemaking',
  auditTotal: 0,
  auditFn: 0,
  confirmedTotal: 0,
  confirmedCrec: 0,
};

describe('evaluateCategoryHealth (#840)', () => {
  it('warns on a sustained high audit false-negative rate', () => {
    const results = evaluateCategoryHealth([{ ...base, auditTotal: 100, auditFn: 25 }]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'rulemaking:audit-fn',
      check: 'audit-fn',
      severity: 'warn',
      n: 100,
    });
    expect(results[0].value).toBeCloseTo(0.25);
  });

  it('stays silent at the healthy-category rate', () => {
    expect(evaluateCategoryHealth([{ ...base, auditTotal: 100, auditFn: 9 }])).toEqual([]);
  });

  it('warns exactly at the FN threshold boundary (>= semantics)', () => {
    expect(evaluateCategoryHealth([{ ...base, auditTotal: 100, auditFn: 15 }])).toHaveLength(1);
    expect(evaluateCategoryHealth([{ ...base, auditTotal: 100, auditFn: 14 }])).toEqual([]);
  });

  it('never evaluates FN rate on tiny audit samples (the hatch 2/11 case)', () => {
    expect(evaluateCategoryHealth([{ ...base, auditTotal: 11, auditFn: 2 }])).toEqual([]);
    expect(
      evaluateCategoryHealth([
        { ...base, auditTotal: DEFAULT_HEALTH_THRESHOLDS.auditMinSamples - 1, auditFn: 10 },
      ]),
    ).toEqual([]);
  });

  it('warns when floor speeches exceed the discussion-share ceiling (> semantics)', () => {
    const results = evaluateCategoryHealth([
      { ...base, category: 'hatch', confirmedTotal: 36, confirmedCrec: 27 },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'hatch:discussion-share',
      check: 'discussion-share',
      severity: 'warn',
    });
    // Exactly at the ceiling does not warn.
    expect(evaluateCategoryHealth([{ ...base, confirmedTotal: 20, confirmedCrec: 12 }])).toEqual(
      [],
    );
  });

  it('never evaluates discussion share below the confirmation floor', () => {
    expect(evaluateCategoryHealth([{ ...base, confirmedTotal: 14, confirmedCrec: 14 }])).toEqual(
      [],
    );
  });

  it('reports both checks independently for one category', () => {
    const results = evaluateCategoryHealth([
      {
        category: 'mediaFreedom',
        auditTotal: 42,
        auditFn: 9,
        confirmedTotal: 102,
        confirmedCrec: 62,
      },
    ]);
    expect(results.map((r) => r.check).sort()).toEqual(['audit-fn', 'discussion-share']);
  });

  it('is warn-tier only', () => {
    const results = evaluateCategoryHealth([
      { category: 'x', auditTotal: 1000, auditFn: 900, confirmedTotal: 1000, confirmedCrec: 1000 },
    ]);
    expect(results.every((r) => r.severity === 'warn')).toBe(true);
  });
});
