import { describe, expect, it } from 'vitest';
import {
  describeBaselinePairs,
  describeUnreconciled,
  planReconciliation,
  RECONCILE_MAX_WEEKS,
  repairCommandFor,
} from '@/lib/services/reconciliation-plan';

const T2 = '2025-01-20';

describe('planReconciliation (#667)', () => {
  it('scores analysis-period weeks and reports baseline weeks without touching them', () => {
    const plan = planReconciliation(
      [
        { category: 'fiscal', weekOf: '2022-03-07' },
        { category: 'elections', weekOf: '2026-07-13' },
        { category: 'civilLiberties', weekOf: '2025-01-20' },
      ],
      { from: T2 },
    );
    expect(plan.inScope.map((p) => p.weekOf)).toEqual(['2026-07-13', '2025-01-20']);
    expect(plan.baseline).toEqual([{ category: 'fiscal', weekOf: '2022-03-07' }]);
    expect(plan.deferred).toEqual([]);
  });

  it('caps the per-run work newest-first and defers the rest', () => {
    const pairs = Array.from({ length: RECONCILE_MAX_WEEKS + 3 }, (_, i) => ({
      category: 'rulemaking',
      weekOf: `2025-${String(2 + Math.floor(i / 4)).padStart(2, '0')}-${String(3 + (i % 4) * 7).padStart(2, '0')}`,
    }));
    const plan = planReconciliation(pairs, { from: T2 });
    expect(plan.inScope).toHaveLength(RECONCILE_MAX_WEEKS);
    expect(plan.deferred).toHaveLength(3);
    // Newest week is worked first; the deferred tail is the oldest.
    expect(plan.inScope[0].weekOf > plan.inScope[plan.inScope.length - 1].weekOf).toBe(true);
    expect(
      plan.deferred.every((d) => d.weekOf < plan.inScope[plan.inScope.length - 1].weekOf),
    ).toBe(true);
  });

  it('honors a custom cap', () => {
    const pairs = [
      { category: 'a', weekOf: '2025-03-03' },
      { category: 'b', weekOf: '2025-03-10' },
    ];
    const plan = planReconciliation(pairs, { from: T2, maxWeeks: 1 });
    expect(plan.inScope).toEqual([{ category: 'b', weekOf: '2025-03-10' }]);
    expect(plan.deferred).toEqual([{ category: 'a', weekOf: '2025-03-03' }]);
  });
});

describe('describeUnreconciled', () => {
  it('is silent when everything was reconciled', () => {
    expect(describeUnreconciled({ inScope: [], deferred: [], baseline: [] })).toEqual([]);
  });

  it('names deferred and baseline pairs and points at the manual repair', () => {
    const lines = describeUnreconciled({
      inScope: [],
      deferred: [{ category: 'fiscal', weekOf: '2025-06-02' }],
      baseline: [{ category: 'elections', weekOf: '2018-05-07' }],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('deferred 1');
    expect(lines[0]).toContain('fiscal 2025-06-02');
    expect(lines[1]).toContain('BASELINE');
    expect(lines[1]).toContain('elections 2018-05-07');
    expect(lines[1]).toContain(
      'pipeline:repair --from 2018-05-07 --to 2018-05-13 --confirm-baseline',
    );
  });
});

describe('repairCommandFor / describeBaselinePairs (#825)', () => {
  it('spans Monday to Sunday and carries the baseline acknowledgment', () => {
    expect(repairCommandFor('2024-12-30')).toBe(
      'pnpm pipeline:repair --from 2024-12-30 --to 2025-01-05 --confirm-baseline',
    );
  });

  it('names every pair with its detail and its own command; empty when none', () => {
    expect(describeBaselinePairs('aggregate parity', [])).toBe('');
    const line = describeBaselinePairs('aggregate parity', [
      { category: 'executiveOversight', weekOf: '2024-09-30', detail: 'agg=29 scores=30' },
      { category: 'fiscal', weekOf: '2022-03-07' },
    ]);
    expect(line).toContain('aggregate parity skipped 2 BASELINE category-week(s)');
    expect(line).toContain(
      'executiveOversight 2024-09-30 (agg=29 scores=30) → pnpm pipeline:repair --from 2024-09-30 --to 2024-10-06 --confirm-baseline',
    );
    expect(line).toContain('fiscal 2022-03-07 → pnpm pipeline:repair --from 2022-03-07');
  });
});
