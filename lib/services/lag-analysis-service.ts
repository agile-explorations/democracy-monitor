import { asc, eq, gte, lte, and } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { intentWeekly } from '@/lib/db/schema';
import type { LagAnalysisResult, PolicyArea } from '@/lib/types/intent';
import { POLICY_AREAS } from '@/lib/types/intent';

const DEFAULT_MAX_LAG = 12;
const MIN_DATA_POINTS = 4;
const CORRELATION_SIGNIFICANCE_THRESHOLD = 0.2;

/**
 * Compute the Pearson correlation coefficient between two arrays.
 * Returns 0 if inputs are invalid or have zero variance.
 */
export function pearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const denom = Math.sqrt(varX * varY);
  return denom === 0 ? 0 : cov / denom;
}

export interface LagAnalysisOptions {
  maxLagWeeks?: number;
  from?: string;
  to?: string;
}

/**
 * Compute the rhetoric→action lag for a single policy area.
 * Fetches weekly intent data, builds rhetoric & action time series,
 * then cross-correlates at lags 0..maxLagWeeks.
 */
export async function computeRhetoricActionLag(
  policyArea: PolicyArea,
  options: LagAnalysisOptions = {},
): Promise<LagAnalysisResult> {
  const maxLag = options.maxLagWeeks ?? DEFAULT_MAX_LAG;

  if (!isDbAvailable()) {
    return emptyResult(policyArea);
  }

  const db = getDb();

  const conditions = [eq(intentWeekly.policyArea, policyArea)];
  if (options.from) conditions.push(gte(intentWeekly.weekOf, options.from));
  if (options.to) conditions.push(lte(intentWeekly.weekOf, options.to));

  const rows = await db
    .select({
      weekOf: intentWeekly.weekOf,
      rhetoricScore: intentWeekly.rhetoricScore,
      actionScore: intentWeekly.actionScore,
    })
    .from(intentWeekly)
    .where(and(...conditions))
    .orderBy(asc(intentWeekly.weekOf));

  if (rows.length < MIN_DATA_POINTS) {
    return emptyResult(policyArea, rows.length);
  }

  const rhetoric = rows.map((r) => r.rhetoricScore);
  const action = rows.map((r) => r.actionScore);

  return computeLagFromSeries(policyArea, rhetoric, action, maxLag);
}

/**
 * Pure computation: given rhetoric and action time series, compute cross-correlation
 * at each lag and find the maximum.
 */
export function computeLagFromSeries(
  policyArea: PolicyArea,
  rhetoric: number[],
  action: number[],
  maxLag: number,
): LagAnalysisResult {
  const n = rhetoric.length;
  const correlationByLag: Array<{ lag: number; correlation: number }> = [];

  let maxCorrelation = -Infinity;
  let bestLag = 0;

  for (let lag = 0; lag <= Math.min(maxLag, n - MIN_DATA_POINTS); lag++) {
    // rhetoric[0..n-lag-1] vs action[lag..n-1]
    const rSlice = rhetoric.slice(0, n - lag);
    const aSlice = action.slice(lag);
    const r = pearsonR(rSlice, aSlice);
    const rounded = Math.round(r * 1000) / 1000;

    correlationByLag.push({ lag, correlation: rounded });

    if (rounded > maxCorrelation) {
      maxCorrelation = rounded;
      bestLag = lag;
    }
  }

  return {
    policyArea,
    maxCorrelation,
    lagWeeks: bestLag,
    interpretation: interpretLag(bestLag, maxCorrelation),
    correlationByLag,
    dataPoints: n,
  };
}

/**
 * Compute rhetoric→action lag analysis for all 5 policy areas.
 */
export async function computeAllLags(
  options: LagAnalysisOptions = {},
): Promise<LagAnalysisResult[]> {
  const results: LagAnalysisResult[] = [];
  for (const area of POLICY_AREAS) {
    const result = await computeRhetoricActionLag(area, options);
    results.push(result);
  }
  return results;
}

function interpretLag(lagWeeks: number, correlation: number): string {
  if (correlation < CORRELATION_SIGNIFICANCE_THRESHOLD) {
    return 'No significant correlation between rhetoric and action';
  }
  if (lagWeeks === 0) {
    return 'Rhetoric and action move together (no detectable lag)';
  }
  if (lagWeeks === 1) {
    return `Rhetoric leads action by ~1 week (r=${correlation.toFixed(2)})`;
  }
  return `Rhetoric leads action by ~${lagWeeks} weeks (r=${correlation.toFixed(2)})`;
}

function emptyResult(policyArea: PolicyArea, dataPoints: number = 0): LagAnalysisResult {
  return {
    policyArea,
    maxCorrelation: 0,
    lagWeeks: 0,
    interpretation: 'Insufficient data for lag analysis',
    correlationByLag: [],
    dataPoints,
  };
}
