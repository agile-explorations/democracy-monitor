import { describe, expect, it } from 'vitest';
import {
  computeSourceConvergenceRatio,
  buildWeekMetadata,
  buildBaselineDistribution,
} from '@/lib/services/baseline-distributions';
import { computeStructuralScore } from '@/lib/services/structural-anomaly-service';
import type { BaselineDistribution, WeekMetadata } from '@/lib/types/structural';

interface DocRow {
  sourceType: string;
  title: string;
  action: string | null;
  agency: string | null;
  publishedAt: Date | null;
}

function makeDocRow(sourceType: string, title = 'Test', daysOffset = 0): DocRow {
  const d = new Date('2022-06-06');
  d.setDate(d.getDate() + daysOffset);
  return { sourceType, title, action: null, agency: 'Test Agency', publishedAt: d };
}

describe('computeSourceConvergenceRatio', () => {
  it('returns 0 when government and rhetoric counts are equal', () => {
    const rows = [makeDocRow('Notice'), makeDocRow('rhetoric')];
    const ratio = computeSourceConvergenceRatio(rows);
    // log2((1+1)/(1+1)) = log2(1) = 0
    expect(ratio).toBeCloseTo(0);
  });

  it('returns positive when more government docs', () => {
    const rows = [makeDocRow('Notice'), makeDocRow('Rule'), makeDocRow('rhetoric')];
    const ratio = computeSourceConvergenceRatio(rows);
    // log2((2+1)/(1+1)) = log2(1.5) ≈ 0.585
    expect(ratio).toBeGreaterThan(0);
  });

  it('returns negative when more rhetoric docs', () => {
    const rows = [
      makeDocRow('Notice'),
      makeDocRow('rhetoric'),
      makeDocRow('rhetoric'),
      makeDocRow('rhetoric'),
    ];
    const ratio = computeSourceConvergenceRatio(rows);
    // log2((1+1)/(3+1)) = log2(0.5) = -1
    expect(ratio).toBeLessThan(0);
  });

  it('handles empty rows', () => {
    const ratio = computeSourceConvergenceRatio([]);
    // log2((0+1)/(0+1)) = log2(1) = 0
    expect(ratio).toBe(0);
  });

  it('handles zero rhetoric docs', () => {
    const rows = [makeDocRow('Notice'), makeDocRow('Rule')];
    const ratio = computeSourceConvergenceRatio(rows);
    // log2((2+1)/(0+1)) = log2(3) ≈ 1.585
    expect(ratio).toBeGreaterThan(1);
  });

  it('handles zero government docs', () => {
    const rows = [makeDocRow('rhetoric'), makeDocRow('rhetoric')];
    const ratio = computeSourceConvergenceRatio(rows);
    // log2((0+1)/(2+1)) = log2(1/3) ≈ -1.585
    expect(ratio).toBeLessThan(-1);
  });

  it('ignores non-government, non-rhetoric source types', () => {
    const rows = [makeDocRow('unknown'), makeDocRow('other')];
    const ratio = computeSourceConvergenceRatio(rows);
    // No gov, no rhetoric — log2(1/1) = 0
    expect(ratio).toBe(0);
  });

  it('recognizes all government doc types', () => {
    const govTypes = [
      'Notice',
      'Rule',
      'Proposed Rule',
      'Presidential Document',
      'executive_order',
      'presidential_memorandum',
      'proclamation',
      'presidential_notice',
      'final_rule',
      'proposed_rule',
      'notice',
    ];
    const rows = govTypes.map((t) => makeDocRow(t));
    const ratio = computeSourceConvergenceRatio(rows);
    // All gov, no rhetoric
    expect(ratio).toBeGreaterThan(0);
  });
});

describe('buildWeekMetadata with source convergence', () => {
  it('includes sourceConvergenceRatio', () => {
    const rows = [makeDocRow('Notice', 'Test 1', 0), makeDocRow('rhetoric', 'Test 2', 1)];
    const metadata = buildWeekMetadata('civilService', '2022-06-06', rows);
    expect(metadata.sourceConvergenceRatio).toBeDefined();
    expect(typeof metadata.sourceConvergenceRatio).toBe('number');
  });
});

describe('buildBaselineDistribution with source convergence', () => {
  it('includes source convergence stats', () => {
    const rows: DocRow[] = [];
    // 4 weeks of data
    for (let w = 0; w < 4; w++) {
      for (let d = 0; d < 3; d++) {
        rows.push(makeDocRow('Notice', `Doc ${w}-${d}`, w * 7 + d));
        rows.push(makeDocRow('rhetoric', `Rhetoric ${w}-${d}`, w * 7 + d));
      }
    }

    const config = { id: 'test', from: '2022-06-06', to: '2022-07-04', label: 'Test' };
    const baseline = buildBaselineDistribution(config, 'civilService', rows);

    expect(baseline.meanSourceConvergenceRatio).toBeDefined();
    expect(baseline.stdDevSourceConvergenceRatio).toBeDefined();
    expect(typeof baseline.meanSourceConvergenceRatio).toBe('number');
  });
});

describe('structural score with source convergence dimension', () => {
  it('includes sourceConvergence when baseline data available', () => {
    const week: WeekMetadata = {
      category: 'civilService',
      weekOf: '2026-02-17',
      documentCount: 10,
      typeDistribution: { Notice: 0.5, rhetoric: 0.5 },
      functionalDistribution: {
        rulemaking: 0.2,
        executive_action: 0.1,
        personnel_action: 0.1,
        administrative_procedure: 0.1,
        organizational_change: 0.1,
        financial_regulatory: 0.1,
        cultural_ceremonial: 0.1,
        news_rhetoric: 0.1,
        unclassified: 0.1,
      },
      agencyDistribution: { 'Test Agency': 1 },
      dailyCounts: [2, 1, 2, 1, 2, 1, 1],
      sourceConvergenceRatio: 0.5,
    };

    const baseline: BaselineDistribution = {
      baselineId: 'biden_2022',
      category: 'civilService',
      meanDocCount: 10,
      stdDevDocCount: 3,
      typeDistribution: { Notice: 0.5, rhetoric: 0.5 },
      functionalDistribution: {
        rulemaking: 0.2,
        executive_action: 0.1,
        personnel_action: 0.1,
        administrative_procedure: 0.1,
        organizational_change: 0.1,
        financial_regulatory: 0.1,
        cultural_ceremonial: 0.1,
        news_rhetoric: 0.1,
        unclassified: 0.1,
      },
      agencyDistribution: { 'Test Agency': 1 },
      meanDailyVariance: 0.5,
      stdDevDailyVariance: 0.2,
      meanSourceConvergenceRatio: 0,
      stdDevSourceConvergenceRatio: 0.3,
    };

    const score = computeStructuralScore(week, baseline);
    expect(score.dimensions.sourceConvergence).toBeDefined();
    expect(score.dimensions.sourceConvergence!.available).toBe(true);
    expect(score.dimensions.sourceConvergence!.zScore).toBeCloseTo(0.5 / 0.3);
  });

  it('omits sourceConvergence when baseline data missing', () => {
    const week: WeekMetadata = {
      category: 'civilService',
      weekOf: '2026-02-17',
      documentCount: 10,
      typeDistribution: { Notice: 1 },
      functionalDistribution: {
        rulemaking: 1,
        executive_action: 0,
        personnel_action: 0,
        administrative_procedure: 0,
        organizational_change: 0,
        financial_regulatory: 0,
        cultural_ceremonial: 0,
        news_rhetoric: 0,
        unclassified: 0,
      },
      agencyDistribution: { 'Test Agency': 1 },
      dailyCounts: [2, 1, 2, 1, 2, 1, 1],
    };

    const baseline: BaselineDistribution = {
      baselineId: 'biden_2022',
      category: 'civilService',
      meanDocCount: 10,
      stdDevDocCount: 3,
      typeDistribution: { Notice: 1 },
      functionalDistribution: {
        rulemaking: 1,
        executive_action: 0,
        personnel_action: 0,
        administrative_procedure: 0,
        organizational_change: 0,
        financial_regulatory: 0,
        cultural_ceremonial: 0,
        news_rhetoric: 0,
        unclassified: 0,
      },
      agencyDistribution: { 'Test Agency': 1 },
      meanDailyVariance: 0.5,
      stdDevDailyVariance: 0.2,
    };

    const score = computeStructuralScore(week, baseline);
    expect(score.dimensions.sourceConvergence).toBeUndefined();
  });
});
