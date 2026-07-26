import { describe, it, expect } from 'vitest';
import {
  buildWeekMetadata,
  buildBaselineDistribution,
  computeSourceConvergenceRatio,
} from '@/lib/services/baseline-distributions';

describe('buildWeekMetadata', () => {
  it('counts rows without caseId by title', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'Rule A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'),
      },
      {
        sourceType: 'Notice',
        title: 'Rule B',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-03'),
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    expect(meta.documentCount).toBe(2);
  });

  it('deduplicates rows with the same caseId', () => {
    const rows = [
      {
        sourceType: 'court_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: 'D.C. Circuit',
        publishedAt: new Date('2025-06-02'),
        caseId: 'cl:12345',
      },
      {
        sourceType: 'judicial_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: 'D.C. Circuit',
        publishedAt: new Date('2025-06-05'),
        caseId: 'cl:12345',
      },
    ];
    const meta = buildWeekMetadata('judicialIndependence', '2025-06-02', rows);
    // Two rows with the same caseId count as one case for volume
    expect(meta.documentCount).toBe(1);
  });

  it('counts different caseIds as separate cases', () => {
    const rows = [
      {
        sourceType: 'court_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-02'),
        caseId: 'cl:111',
      },
      {
        sourceType: 'judicial_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-03'),
        caseId: 'cl:111',
      },
      {
        sourceType: 'court_opinion',
        title: 'Doe v. Roe',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-04'),
        caseId: 'cl:222',
      },
    ];
    const meta = buildWeekMetadata('civilLiberties', '2025-06-02', rows);
    expect(meta.documentCount).toBe(2);
  });

  it('mixes CL caseId dedup with non-CL title-based counting', () => {
    const rows = [
      {
        sourceType: 'court_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-02'),
        caseId: 'cl:111',
      },
      {
        sourceType: 'judicial_opinion',
        title: 'Smith v. Jones',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-03'),
        caseId: 'cl:111',
      },
      {
        sourceType: 'Notice',
        title: 'EPA Rule on Emissions',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-04'),
        caseId: null,
      },
      {
        sourceType: 'Notice',
        title: 'Another Rule',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-05'),
        caseId: null,
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    // cl:111 counts once, two non-CL docs count by title (each unique)
    expect(meta.documentCount).toBe(3);
  });

  it('uses UNKNOWN_AGENCY label for null agency values', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'Rule A',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-02'),
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    expect(meta.agencyDistribution).toHaveProperty('unknown');
    expect(meta.agencyDistribution['unknown']).toBe(1);
  });

  it('computes type distribution proportionally', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'Rule A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'),
      },
      {
        sourceType: 'Notice',
        title: 'Rule B',
        action: null,
        agency: 'DOJ',
        publishedAt: new Date('2025-06-03'),
      },
      {
        sourceType: 'Rule',
        title: 'Rule C',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-04'),
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    // 2 Notice out of 3 total
    expect(meta.typeDistribution['Notice']).toBeCloseTo(2 / 3);
    expect(meta.typeDistribution['Rule']).toBeCloseTo(1 / 3);
  });

  it('computes dailyCounts across the 7-day week', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'Rule A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'), // day 0
      },
      {
        sourceType: 'Notice',
        title: 'Rule B',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'), // day 0 again
      },
      {
        sourceType: 'Rule',
        title: 'Rule C',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-05'), // day 3
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    expect(meta.dailyCounts[0]).toBe(2); // day 0
    expect(meta.dailyCounts[3]).toBe(1); // day 3
    expect(meta.dailyCounts[1]).toBe(0); // day 1
  });

  it('skips null publishedAt dates in dailyCounts', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'Rule A',
        action: null,
        agency: 'EPA',
        publishedAt: null,
      },
      {
        sourceType: 'Notice',
        title: 'Rule B',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'),
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    // Only 1 doc has a valid date
    const totalDailyCounts = meta.dailyCounts.reduce((s, v) => s + v, 0);
    expect(totalDailyCounts).toBe(1);
  });

  it('ignores dates outside the 7-day window in dailyCounts', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'Rule A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-01'), // before weekOf
      },
      {
        sourceType: 'Notice',
        title: 'Rule B',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-10'), // after 7-day window
      },
      {
        sourceType: 'Notice',
        title: 'Rule C',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-03'), // within window
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    const totalDailyCounts = meta.dailyCounts.reduce((s, v) => s + v, 0);
    expect(totalDailyCounts).toBe(1);
  });

  it('computes sourceConvergenceRatio correctly', () => {
    const meta = buildWeekMetadata('environment', '2025-06-02', [
      {
        sourceType: 'Notice',
        title: 'Rule A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'),
      },
      {
        sourceType: 'rhetoric',
        title: 'News article',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-03'),
      },
    ]);
    // log2((1+1)/(1+1)) = log2(1) = 0
    expect(meta.sourceConvergenceRatio).toBeCloseTo(0);
  });

  it('returns action field from metadata to functional classifier', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'Rule A',
        action: 'Final Rule',
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'),
      },
    ];
    const meta = buildWeekMetadata('environment', '2025-06-02', rows);
    // functionalDistribution should have entries (exact bucket depends on classifier)
    expect(Object.keys(meta.functionalDistribution).length).toBeGreaterThan(0);
  });
});

describe('computeSourceConvergenceRatio', () => {
  it('returns 0 for empty rows', () => {
    expect(computeSourceConvergenceRatio([])).toBeCloseTo(0);
  });

  it('returns positive ratio when only government docs', () => {
    const rows = [
      { sourceType: 'Notice', title: 'A', action: null, agency: null, publishedAt: null },
      { sourceType: 'Rule', title: 'B', action: null, agency: null, publishedAt: null },
    ];
    // log2((2+1)/(0+1)) = log2(3) ≈ 1.585
    expect(computeSourceConvergenceRatio(rows)).toBeCloseTo(Math.log2(3));
  });

  it('returns negative ratio when only rhetoric docs', () => {
    const rows = [
      { sourceType: 'rhetoric', title: 'A', action: null, agency: null, publishedAt: null },
      { sourceType: 'rhetoric', title: 'B', action: null, agency: null, publishedAt: null },
    ];
    // log2((0+1)/(2+1)) = log2(1/3) ≈ -1.585
    expect(computeSourceConvergenceRatio(rows)).toBeCloseTo(Math.log2(1 / 3));
  });

  it('returns 0 when doc types are neither government nor rhetoric', () => {
    const rows = [
      { sourceType: 'unknown_type', title: 'A', action: null, agency: null, publishedAt: null },
    ];
    // log2((0+1)/(0+1)) = 0
    expect(computeSourceConvergenceRatio(rows)).toBeCloseTo(0);
  });
});

describe('buildBaselineDistribution', () => {
  const baseConfig = {
    id: 'test-baseline',
    label: 'Test Baseline',
    from: '2025-06-02',
    to: '2025-06-22',
    cycleYear: 1 as const,
    administration: 'test',
    calendarYear: 2025,
    availableSources: [] as string[],
  };

  it('computes mean and stddev of weekly doc counts', () => {
    // Spread docs across 2 weeks (Monday-based)
    const rows = [
      {
        sourceType: 'Notice',
        title: 'A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'), // Mon wk1
      },
      {
        sourceType: 'Notice',
        title: 'B',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-03'), // Tue wk1
      },
      {
        sourceType: 'Notice',
        title: 'C',
        action: null,
        agency: 'DOJ',
        publishedAt: new Date('2025-06-09'), // Mon wk2
      },
    ];

    const result = buildBaselineDistribution(baseConfig, 'environment', rows);
    // Week 1: 2 docs, Week 2: 1 doc → mean = 1.5
    expect(result.meanDocCount).toBe(1.5);
    expect(result.stdDevDocCount).toBeGreaterThan(0);
    expect(result.baselineId).toBe('test-baseline');
    expect(result.category).toBe('environment');
  });

  it('computes agency distribution across all rows', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'),
      },
      {
        sourceType: 'Notice',
        title: 'B',
        action: null,
        agency: 'DOJ',
        publishedAt: new Date('2025-06-03'),
      },
      {
        sourceType: 'Rule',
        title: 'C',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-04'),
      },
    ];

    const result = buildBaselineDistribution(baseConfig, 'environment', rows);
    expect(result.agencyDistribution['EPA']).toBeCloseTo(2 / 3);
    expect(result.agencyDistribution['DOJ']).toBeCloseTo(1 / 3);
  });

  it('handles null agency in baseline distribution', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'A',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-02'),
      },
    ];

    const result = buildBaselineDistribution(baseConfig, 'environment', rows);
    expect(result.agencyDistribution).toHaveProperty('unknown');
  });

  it('skips rows with null publishedAt during weekly grouping', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'A',
        action: null,
        agency: 'EPA',
        publishedAt: null,
      },
      {
        sourceType: 'Notice',
        title: 'B',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'),
      },
    ];

    // Should not throw — null publishedAt is skipped in groupByWeek
    const result = buildBaselineDistribution(baseConfig, 'environment', rows);
    // Only 1 row grouped into a week (the other has null publishedAt)
    expect(result.meanDocCount).toBe(1);
  });

  it('computes meanDailyVariance and stdDevDailyVariance', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'), // Mon
      },
      {
        sourceType: 'Notice',
        title: 'B',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'), // Mon (same day)
      },
      {
        sourceType: 'Rule',
        title: 'C',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-04'), // Wed
      },
    ];

    const result = buildBaselineDistribution(baseConfig, 'environment', rows);
    expect(typeof result.meanDailyVariance).toBe('number');
    expect(typeof result.stdDevDailyVariance).toBe('number');
  });

  it('computes meanSourceConvergenceRatio and stdDev', () => {
    const rows = [
      {
        sourceType: 'Notice',
        title: 'A',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-02'),
      },
      {
        sourceType: 'rhetoric',
        title: 'B',
        action: null,
        agency: null,
        publishedAt: new Date('2025-06-03'),
      },
      {
        sourceType: 'Notice',
        title: 'C',
        action: null,
        agency: 'EPA',
        publishedAt: new Date('2025-06-09'),
      },
    ];

    const result = buildBaselineDistribution(baseConfig, 'environment', rows);
    expect(typeof result.meanSourceConvergenceRatio).toBe('number');
    expect(typeof result.stdDevSourceConvergenceRatio).toBe('number');
  });
});

describe('jsdStats (#573)', () => {
  const baseConfig = {
    id: 'biden_2021',
    from: '2025-06-01',
    to: '2025-07-01',
  } as Parameters<typeof buildBaselineDistribution>[0];
  const doc = (sourceType: string, agency: string | null, publishedAt: string) => ({
    sourceType,
    title: `${sourceType}-${publishedAt}`,
    action: null,
    agency,
    publishedAt: new Date(publishedAt),
  });

  it('captures empirical weekly divergence — a mix-shifting baseline yields nonzero mean', () => {
    // Week 1 all Notices from EPA; week 2 all Rules from DOJ: each week
    // diverges strongly from the 50/50 aggregate.
    const rows = [
      doc('Notice', 'EPA', '2025-06-02'),
      doc('Notice', 'EPA', '2025-06-03'),
      doc('Rule', 'DOJ', '2025-06-09'),
      doc('Rule', 'DOJ', '2025-06-10'),
    ];
    const result = buildBaselineDistribution(baseConfig, 'environment', rows);
    expect(result.jsdStats).toBeDefined();
    expect(result.jsdStats!.type.mean).toBeGreaterThan(0.1);
    expect(result.jsdStats!.agency.mean).toBeGreaterThan(0.1);
  });

  it('applies the std floor when every week diverges identically (single-week baseline)', () => {
    const rows = [doc('Notice', 'EPA', '2025-06-02'), doc('Notice', 'EPA', '2025-06-03')];
    const result = buildBaselineDistribution(baseConfig, 'environment', rows);
    // One week: stddev of one value is 0 → floored at 0.01.
    expect(result.jsdStats!.type.std).toBe(0.01);
    expect(result.jsdStats!.agency.std).toBe(0.01);
    // And that single week matches the aggregate exactly → mean JSD 0.
    expect(result.jsdStats!.type.mean).toBeCloseTo(0, 6);
  });

  it('a uniform baseline yields near-zero mean divergence (weeks match the aggregate)', () => {
    const rows = [
      doc('Notice', 'EPA', '2025-06-02'),
      doc('Notice', 'EPA', '2025-06-09'),
      doc('Notice', 'EPA', '2025-06-16'),
    ];
    const result = buildBaselineDistribution(baseConfig, 'environment', rows);
    expect(result.jsdStats!.type.mean).toBeCloseTo(0, 6);
    expect(result.jsdStats!.agency.mean).toBeCloseTo(0, 6);
  });
});
