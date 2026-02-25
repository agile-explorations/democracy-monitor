import {
  DRIFT_TREND_THRESHOLD,
  FUNCTIONAL_SHIFT_THRESHOLD,
  JSD_BASELINE_MEAN,
  JSD_BASELINE_STDDEV,
  LONG_HORIZON_WINDOW_WEEKS,
  STRUCTURAL_ANOMALY_THRESHOLD,
  STRUCTURAL_DIMENSION_WEIGHTS,
  STRUCTURAL_MIN_DOC_COUNT,
} from '@/lib/methodology/scoring-config';
import type {
  BaselineDistribution,
  DimensionScore,
  FunctionalBucket,
  FunctionalShift,
  StructuralScore,
  WeekMetadata,
} from '@/lib/types/structural';

/**
 * Jensen-Shannon divergence between two probability distributions.
 * Returns 0 when distributions are identical, up to ln(2) ≈ 0.693 when disjoint.
 * Handles missing keys by treating them as 0.
 */
export function jensenShannonDivergence(
  p: Record<string, number>,
  q: Record<string, number>,
): number {
  const allKeys = new Set([...Object.keys(p), ...Object.keys(q)]);
  if (allKeys.size === 0) return 0;

  let klPM = 0;
  let klQM = 0;

  for (const key of allKeys) {
    const pi = p[key] ?? 0;
    const qi = q[key] ?? 0;
    const mi = (pi + qi) / 2;

    if (mi === 0) continue;
    if (pi > 0) klPM += pi * Math.log(pi / mi);
    if (qi > 0) klQM += qi * Math.log(qi / mi);
  }

  return (klPM + klQM) / 2;
}

/** Compute z-score. Returns 0 when stddev is 0. */
export function zScore(value: number, baselineMean: number, baselineStdDev: number): number {
  if (baselineStdDev === 0) return value === baselineMean ? 0 : Math.abs(value - baselineMean);
  return (value - baselineMean) / baselineStdDev;
}

function makeDimensionScore(
  value: number,
  baselineMean: number,
  baselineStdDev: number,
): DimensionScore {
  return {
    value,
    baselineMean,
    baselineStdDev,
    zScore: zScore(value, baselineMean, baselineStdDev),
    available: true,
  };
}

function unavailableDimension(): DimensionScore {
  return { value: 0, baselineMean: 0, baselineStdDev: 0, zScore: 0, available: false };
}

/** Compute variance of an array. Returns 0 for empty/single-element arrays. */
function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
}

/** Detect significant functional distribution shifts. */
export function detectFunctionalShifts(
  current: Record<FunctionalBucket, number>,
  baseline: Record<FunctionalBucket, number>,
): FunctionalShift[] {
  const shifts: FunctionalShift[] = [];
  const allKeys = new Set([...Object.keys(current), ...Object.keys(baseline)]);

  for (const key of allKeys) {
    const bucket = key as FunctionalBucket;
    const currentRate = current[bucket] ?? 0;
    const baselineRate = baseline[bucket] ?? 0;
    const diff = Math.abs(currentRate - baselineRate);

    if (diff < FUNCTIONAL_SHIFT_THRESHOLD) continue;

    if (baselineRate > 0 && currentRate === 0) {
      shifts.push({ bucket, baselineRate, currentRate, direction: 'absent' });
    } else if (currentRate > baselineRate) {
      shifts.push({ bucket, baselineRate, currentRate, direction: 'increased' });
    } else {
      shifts.push({ bucket, baselineRate, currentRate, direction: 'decreased' });
    }
  }

  return shifts;
}

function computeDimensions(
  week: WeekMetadata,
  baseline: BaselineDistribution,
): StructuralScore['dimensions'] {
  const volume = makeDimensionScore(
    week.documentCount,
    baseline.meanDocCount,
    baseline.stdDevDocCount,
  );

  const typeJSD = jensenShannonDivergence(week.typeDistribution, baseline.typeDistribution);
  const typeComposition = makeDimensionScore(typeJSD, JSD_BASELINE_MEAN, JSD_BASELINE_STDDEV);

  const funcJSD = jensenShannonDivergence(
    week.functionalDistribution as Record<string, number>,
    baseline.functionalDistribution as Record<string, number>,
  );
  const functionalDistribution = makeDimensionScore(
    funcJSD,
    JSD_BASELINE_MEAN,
    JSD_BASELINE_STDDEV,
  );

  const agencyJSD = jensenShannonDivergence(week.agencyDistribution, baseline.agencyDistribution);
  const agencyActivity = makeDimensionScore(agencyJSD, JSD_BASELINE_MEAN, JSD_BASELINE_STDDEV);

  const dailyVar = variance(week.dailyCounts);
  const publicationTempo = makeDimensionScore(
    dailyVar,
    baseline.meanDailyVariance,
    baseline.stdDevDailyVariance,
  );

  const sourceConvergence =
    week.sourceConvergenceRatio !== undefined &&
    baseline.meanSourceConvergenceRatio !== undefined &&
    baseline.stdDevSourceConvergenceRatio !== undefined
      ? makeDimensionScore(
          week.sourceConvergenceRatio,
          baseline.meanSourceConvergenceRatio,
          baseline.stdDevSourceConvergenceRatio,
        )
      : undefined;

  return {
    volume,
    typeComposition,
    functionalDistribution,
    agencyActivity,
    publicationTempo,
    sourceConvergence,
  };
}

/**
 * Compute the composite structural anomaly score for a single category-week.
 * Pure function — no I/O.
 */
export function computeStructuralScore(
  week: WeekMetadata,
  baseline: BaselineDistribution,
): StructuralScore {
  const dimensions = computeDimensions(week, baseline);
  const rawComposite = computeWeightedComposite(dimensions);
  // Dampen composite for small-corpus category-weeks (z-scores are unreliable with few docs)
  const dampening =
    Math.min(week.documentCount, STRUCTURAL_MIN_DOC_COUNT) / STRUCTURAL_MIN_DOC_COUNT;
  const composite = rawComposite * dampening;
  const functionalShifts = detectFunctionalShifts(
    week.functionalDistribution,
    baseline.functionalDistribution,
  );

  return {
    composite,
    dimensions,
    anomalous: composite > STRUCTURAL_ANOMALY_THRESHOLD,
    functionalShifts,
    longHorizon: { cumulativeDeviation: 0, cumulativeWindow: 0, driftTrend: 'stable' },
  };
}

/** Weighted composite from dimension absolute z-scores. */
function computeWeightedComposite(dimensions: StructuralScore['dimensions']): number {
  const w = STRUCTURAL_DIMENSION_WEIGHTS;
  let totalWeight = 0;
  let weighted = 0;

  const entries: Array<[keyof typeof w, DimensionScore | undefined]> = [
    ['volume', dimensions.volume],
    ['typeComposition', dimensions.typeComposition],
    ['functionalDistribution', dimensions.functionalDistribution],
    ['agencyActivity', dimensions.agencyActivity],
    ['publicationTempo', dimensions.publicationTempo],
    ['sourceConvergence', dimensions.sourceConvergence],
  ];

  for (const [key, dim] of entries) {
    if (!dim || !dim.available) continue;
    weighted += w[key] * Math.abs(dim.zScore);
    totalWeight += w[key];
  }

  if (totalWeight === 0) return 0;
  return weighted / totalWeight;
}

/**
 * Compute long-horizon drift from a sequence of weekly composite scores.
 * Expects scores ordered oldest-first, with the current week last.
 */
export function computeLongHorizonDrift(
  weeklyComposites: number[],
): StructuralScore['longHorizon'] {
  const windowSize = Math.min(weeklyComposites.length, LONG_HORIZON_WINDOW_WEEKS);
  if (windowSize === 0) {
    return { cumulativeDeviation: 0, cumulativeWindow: 0, driftTrend: 'stable' };
  }

  const window = weeklyComposites.slice(-windowSize);
  const cumulativeDeviation = window.reduce((sum, v) => sum + v, 0);

  let driftTrend: 'stable' | 'increasing' | 'decreasing' = 'stable';
  if (window.length >= 4) {
    const half = Math.floor(window.length / 2);
    const firstHalf = window.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const secondHalf = window.slice(half).reduce((s, v) => s + v, 0) / (window.length - half);
    const diff = secondHalf - firstHalf;
    if (diff > DRIFT_TREND_THRESHOLD) driftTrend = 'increasing';
    else if (diff < -DRIFT_TREND_THRESHOLD) driftTrend = 'decreasing';
  }

  return { cumulativeDeviation, cumulativeWindow: windowSize, driftTrend };
}
