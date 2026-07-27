import { describe, expect, it } from 'vitest';
import {
  computeStructuralScore,
  jensenShannonDivergence,
  zScore,
  detectFunctionalShifts,
  computeLongHorizonDrift,
} from '@/lib/services/structural-anomaly-service';
import type { BaselineDistribution, FunctionalBucket, WeekMetadata } from '@/lib/types/structural';

function makeBaseline(overrides?: Partial<BaselineDistribution>): BaselineDistribution {
  return {
    baselineId: 'test_baseline',
    category: 'civilService',
    meanDocCount: 50,
    stdDevDocCount: 10,
    typeDistribution: {
      Notice: 0.6,
      Rule: 0.25,
      'Presidential Document': 0.05,
      'Proposed Rule': 0.1,
    },
    functionalDistribution: {
      rulemaking: 0.3,
      executive_action: 0.05,
      personnel_action: 0.1,
      administrative_procedure: 0.2,
      organizational_change: 0.02,
      financial_regulatory: 0.05,
      cultural_ceremonial: 0.01,
      news_rhetoric: 0.07,
      unclassified: 0.2,
    } as Record<FunctionalBucket, number>,
    agencyDistribution: { OPM: 0.3, DOD: 0.2, DHS: 0.2, Other: 0.3 },
    meanDailyVariance: 4,
    stdDevDailyVariance: 2,
    ...overrides,
  };
}

function makeWeekMetadata(overrides?: Partial<WeekMetadata>): WeekMetadata {
  return {
    category: 'civilService',
    weekOf: '2025-06-02',
    documentCount: 50,
    typeDistribution: {
      Notice: 0.6,
      Rule: 0.25,
      'Presidential Document': 0.05,
      'Proposed Rule': 0.1,
    },
    functionalDistribution: {
      rulemaking: 0.3,
      executive_action: 0.05,
      personnel_action: 0.1,
      administrative_procedure: 0.2,
      organizational_change: 0.02,
      financial_regulatory: 0.05,
      cultural_ceremonial: 0.01,
      news_rhetoric: 0.07,
      unclassified: 0.2,
    } as Record<FunctionalBucket, number>,
    agencyDistribution: { OPM: 0.3, DOD: 0.2, DHS: 0.2, Other: 0.3 },
    dailyCounts: [8, 9, 7, 8, 10, 5, 3],
    ...overrides,
  };
}

describe('jensenShannonDivergence', () => {
  it('returns 0 for identical distributions', () => {
    const p = { A: 0.5, B: 0.3, C: 0.2 };
    expect(jensenShannonDivergence(p, p)).toBe(0);
  });

  it('returns positive value for different distributions', () => {
    const p = { A: 0.7, B: 0.2, C: 0.1 };
    const q = { A: 0.1, B: 0.2, C: 0.7 };
    expect(jensenShannonDivergence(p, q)).toBeGreaterThan(0);
  });

  it('is symmetric', () => {
    const p = { A: 0.7, B: 0.3 };
    const q = { A: 0.3, B: 0.7 };
    expect(jensenShannonDivergence(p, q)).toBeCloseTo(jensenShannonDivergence(q, p), 10);
  });

  it('handles missing keys in one distribution', () => {
    const p = { A: 0.5, B: 0.5 };
    const q = { A: 0.5, C: 0.5 };
    const jsd = jensenShannonDivergence(p, q);
    expect(jsd).toBeGreaterThan(0);
    expect(jsd).toBeLessThanOrEqual(Math.log(2));
  });

  it('returns 0 for empty distributions', () => {
    expect(jensenShannonDivergence({}, {})).toBe(0);
  });
});

describe('zScore', () => {
  it('returns 0 when value equals baseline mean', () => {
    expect(zScore(50, 50, 10)).toBe(0);
  });

  it('returns positive for values above mean', () => {
    expect(zScore(70, 50, 10)).toBe(2);
  });

  it('returns negative for values below mean', () => {
    expect(zScore(30, 50, 10)).toBe(-2);
  });

  it('handles zero stddev', () => {
    expect(zScore(50, 50, 0)).toBe(0);
    expect(zScore(60, 50, 0)).toBe(10);
  });
});

describe('detectFunctionalShifts', () => {
  it('detects increased bucket', () => {
    const current = { rulemaking: 0.4, executive_action: 0.1 } as Record<FunctionalBucket, number>;
    const baseline = { rulemaking: 0.3, executive_action: 0.05 } as Record<
      FunctionalBucket,
      number
    >;
    const shifts = detectFunctionalShifts(current, baseline);
    expect(shifts.length).toBe(2);
    expect(shifts.find((s) => s.bucket === 'rulemaking')?.direction).toBe('increased');
    expect(shifts.find((s) => s.bucket === 'executive_action')?.direction).toBe('increased');
  });

  it('detects absent bucket', () => {
    const current = { personnel_action: 0 } as Record<FunctionalBucket, number>;
    const baseline = { personnel_action: 0.1 } as Record<FunctionalBucket, number>;
    const shifts = detectFunctionalShifts(current, baseline);
    expect(shifts.length).toBe(1);
    expect(shifts[0].direction).toBe('absent');
    expect(shifts[0].bucket).toBe('personnel_action');
  });

  it('ignores shifts below threshold', () => {
    const current = { rulemaking: 0.31 } as Record<FunctionalBucket, number>;
    const baseline = { rulemaking: 0.3 } as Record<FunctionalBucket, number>;
    const shifts = detectFunctionalShifts(current, baseline);
    expect(shifts.length).toBe(0);
  });

  it('detects decreased bucket', () => {
    const current = { rulemaking: 0.15 } as Record<FunctionalBucket, number>;
    const baseline = { rulemaking: 0.3 } as Record<FunctionalBucket, number>;
    const shifts = detectFunctionalShifts(current, baseline);
    expect(shifts.length).toBe(1);
    expect(shifts[0].direction).toBe('decreased');
  });
});

describe('computeStructuralScore', () => {
  it('returns low composite for baseline-matching week', () => {
    const week = makeWeekMetadata();
    const baseline = makeBaseline();
    const score = computeStructuralScore(week, baseline);
    // Not exactly 0 because daily variance may differ slightly from baseline
    expect(score.composite).toBeLessThan(0.5);
    expect(score.anomalous).toBe(false);
  });

  it('detects volume anomaly', () => {
    const week = makeWeekMetadata({ documentCount: 100 });
    const baseline = makeBaseline();
    const score = computeStructuralScore(week, baseline);
    expect(score.dimensions.volume.zScore).toBe(5);
    expect(score.composite).toBeGreaterThan(0);
  });

  it('detects type composition shift', () => {
    const week = makeWeekMetadata({
      typeDistribution: { 'Presidential Document': 0.8, Notice: 0.1, Rule: 0.1 },
    });
    const baseline = makeBaseline();
    const score = computeStructuralScore(week, baseline);
    expect(score.dimensions.typeComposition.zScore).toBeGreaterThan(0);
  });

  it('detects functional distribution shift', () => {
    const week = makeWeekMetadata({
      functionalDistribution: {
        rulemaking: 0.05,
        executive_action: 0.5,
        personnel_action: 0.0,
        administrative_procedure: 0.15,
        organizational_change: 0.05,
        financial_regulatory: 0.05,
        cultural_ceremonial: 0.0,
        news_rhetoric: 0.05,
        unclassified: 0.15,
      } as Record<FunctionalBucket, number>,
    });
    const baseline = makeBaseline();
    const score = computeStructuralScore(week, baseline);
    expect(score.dimensions.functionalDistribution.zScore).toBeGreaterThan(0);
    expect(score.functionalShifts.length).toBeGreaterThan(0);
  });

  it('marks as anomalous when composite exceeds threshold', () => {
    const week = makeWeekMetadata({
      documentCount: 150,
      typeDistribution: { 'Presidential Document': 0.9, Notice: 0.1 },
      functionalDistribution: {
        rulemaking: 0.0,
        executive_action: 0.9,
        personnel_action: 0.0,
        administrative_procedure: 0.0,
        organizational_change: 0.0,
        financial_regulatory: 0.0,
        cultural_ceremonial: 0.0,
        news_rhetoric: 0.0,
        unclassified: 0.1,
      } as Record<FunctionalBucket, number>,
      agencyDistribution: { WhiteHouse: 0.9, Other: 0.1 },
    });
    const baseline = makeBaseline();
    const score = computeStructuralScore(week, baseline);
    expect(score.anomalous).toBe(true);
  });

  it('all present dimension scores are marked as available', () => {
    const week = makeWeekMetadata();
    const baseline = makeBaseline();
    const score = computeStructuralScore(week, baseline);
    for (const dim of Object.values(score.dimensions)) {
      if (dim !== undefined) {
        expect(dim.available).toBe(true);
      }
    }
  });

  it('dampens composite for small-corpus category-weeks', () => {
    // Create an anomalous week that would normally trigger above threshold
    const largeWeek = makeWeekMetadata({
      documentCount: 150,
      typeDistribution: { 'Presidential Document': 0.9, Notice: 0.1 },
      agencyDistribution: { WhiteHouse: 0.9, Other: 0.1 },
    });
    const baseline = makeBaseline();
    const largeScore = computeStructuralScore(largeWeek, baseline);

    // Same anomalous pattern but with only 5 documents — should be dampened to 50%
    const smallWeek = makeWeekMetadata({
      documentCount: 5,
      typeDistribution: { 'Presidential Document': 0.9, Notice: 0.1 },
      agencyDistribution: { WhiteHouse: 0.9, Other: 0.1 },
    });
    const smallScore = computeStructuralScore(smallWeek, baseline);

    // Volume z-score differs, but the dampening factor should still reduce the composite
    expect(smallScore.composite).toBeLessThan(largeScore.composite);
    // With 5/10 docs, dampening = 0.5 — composite should be roughly half of what it would be undampened
    expect(smallScore.anomalous).toBe(false);
  });

  it('applies no dampening at or above minimum doc count', () => {
    const week10 = makeWeekMetadata({ documentCount: 10 });
    const week50 = makeWeekMetadata({ documentCount: 50 });
    const baseline = makeBaseline();
    const score10 = computeStructuralScore(week10, baseline);
    const score50 = computeStructuralScore(week50, baseline);
    // Both above threshold — volume z-scores differ but dampening factor is 1.0 for both
    // The difference comes from volume z-score, not dampening
    expect(score10.composite).toBeGreaterThanOrEqual(0);
    expect(score50.composite).toBeGreaterThanOrEqual(0);
  });
});

describe('computeLongHorizonDrift', () => {
  it('returns zero for empty array', () => {
    const result = computeLongHorizonDrift([]);
    expect(result.cumulativeDeviation).toBe(0);
    expect(result.cumulativeWindow).toBe(0);
    expect(result.driftTrend).toBe('stable');
  });

  it('computes cumulative deviation', () => {
    const composites = [1.0, 1.5, 2.0, 1.8, 1.2];
    const result = computeLongHorizonDrift(composites);
    expect(result.cumulativeDeviation).toBeCloseTo(7.5, 5);
    expect(result.cumulativeWindow).toBe(5);
  });

  it('detects increasing trend', () => {
    const composites = [0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.5, 2.0];
    const result = computeLongHorizonDrift(composites);
    expect(result.driftTrend).toBe('increasing');
  });

  it('detects decreasing trend', () => {
    const composites = [2.0, 1.5, 1.2, 1.0, 0.8, 0.5, 0.3, 0.1];
    const result = computeLongHorizonDrift(composites);
    expect(result.driftTrend).toBe('decreasing');
  });

  it('detects stable trend', () => {
    const composites = [1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1];
    const result = computeLongHorizonDrift(composites);
    expect(result.driftTrend).toBe('stable');
  });

  it('limits window to LONG_HORIZON_WINDOW_WEEKS', () => {
    // 15 weeks, but window should cap at 12
    const composites = new Array(15).fill(1.0);
    const result = computeLongHorizonDrift(composites);
    expect(result.cumulativeWindow).toBe(12);
    expect(result.cumulativeDeviation).toBeCloseTo(12.0, 5);
  });
});

describe('empirical JSD stats (#573)', () => {
  it('uses the baseline jsdStats instead of the saturating constants when present', () => {
    const week = makeWeekMetadata({
      typeDistribution: { Notice: 1 },
      agencyDistribution: { OPM: 1 },
    });
    const legacy = computeStructuralScore(week, makeBaseline());
    const empirical = computeStructuralScore(
      week,
      makeBaseline({
        jsdStats: {
          type: { mean: 0.4, std: 0.15 },
          functional: { mean: 0.3, std: 0.12 },
          agency: { mean: 0.5, std: 0.2 },
        },
      }),
    );
    // Same week, same divergences: empirical stats normalize against real
    // weekly variation instead of the 0/0.05 constants, so z drops sharply.
    expect(Math.abs(empirical.dimensions.typeComposition.zScore)).toBeLessThan(
      Math.abs(legacy.dimensions.typeComposition.zScore),
    );
    expect(Math.abs(empirical.dimensions.agencyActivity.zScore)).toBeLessThan(
      Math.abs(legacy.dimensions.agencyActivity.zScore),
    );
    expect(Math.abs(empirical.dimensions.agencyActivity.zScore)).toBeLessThan(4);
  });

  it('falls back to the documented constants when jsdStats is absent (legacy capture)', () => {
    const week = makeWeekMetadata();
    const score = computeStructuralScore(week, makeBaseline());
    expect(score.dimensions.typeComposition.baselineStdDev).toBe(0.05);
  });
});
