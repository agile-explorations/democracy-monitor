/**
 * Pure collapse-detection logic for the per-source funnel diagnostic (#547).
 *
 * Separated from the query/service layer (mirrors event-validation-checks.ts)
 * so the thresholds are boundary-unit-testable with no DB. A "collapse" is a
 * source that has real retrieved volume but a stage-retention ratio far below
 * BOTH an absolute floor AND its sibling baseline — the combination is what
 * avoids false positives on categories that legitimately flag rarely.
 *
 * The mediaFreedom contamination (#524) is the motivating signature: thousands
 * of FR docs retrieved into the category, ~0% ever P1-flagged, against healthy
 * sibling sources — a P1-stage collapse.
 */

export interface FunnelStages {
  retrieved: number;
  passedRelevance: number;
  p1Flagged: number;
  p2Confirmed: number;
}

export interface SourceFunnel {
  category: string;
  sourceOrigin: string;
  stages: FunnelStages;
}

/** The two stages we alert on. P2 confirmation is reported but not alerted —
 *  deep-stage N is naturally small and noisy. */
export type FunnelStage = 'relevance' | 'p1';

export interface FunnelCollapseResult {
  id: string; // `${category}/${sourceOrigin}:${stage}`
  category: string;
  sourceOrigin: string;
  stage: FunnelStage;
  retrieved: number;
  retention: number; // this source's stage retention ratio
  baselineRetention: number; // pooled sibling retention (0 if no siblings)
  severity: 'error' | 'warn';
  reason: string;
}

export interface FunnelThresholds {
  /** Window volume floor (on the stage's INPUT count) below which a source is
   *  not evaluated — percentages on tiny samples are noise. */
  minRetrieved: number;
  /** Relevance retention below this (absolute) is a candidate relevance collapse. */
  relevanceFloor: number;
  /** P1 flag rate below this (absolute), but nonzero, is a candidate warn. */
  p1WarnFloor: number;
  /** A source must be below this fraction of its sibling baseline to alert. */
  relativeRatio: number;
  /** Pooled sibling volume needed to trust the relative test; below it we fall
   *  back to absolute-only and cap severity at warn. */
  baselineMinN: number;
}

export const DEFAULT_FUNNEL_THRESHOLDS: FunnelThresholds = {
  minRetrieved: 500,
  relevanceFloor: 0.05,
  p1WarnFloor: 0.005,
  relativeRatio: 0.2,
  baselineMinN: 500,
};

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** passedRelevance / retrieved (0 when nothing retrieved). */
export function relevanceRetention(s: FunnelStages): number {
  return s.retrieved > 0 ? s.passedRelevance / s.retrieved : 0;
}

/** p1Flagged / passedRelevance (0 when nothing passed relevance). */
export function p1FlagRate(s: FunnelStages): number {
  return s.passedRelevance > 0 ? s.p1Flagged / s.passedRelevance : 0;
}

export interface PooledBaseline {
  retention: number;
  totalN: number;
}

/** Leave-one-out sibling baseline: pooled retention over the OTHER sources in
 *  the category. Pooling (sum-out / sum-in) rather than averaging retentions
 *  weights each sibling by its volume, so a tiny sibling can't skew it. */
export function pooledBaseline(siblings: SourceFunnel[], stage: FunnelStage): PooledBaseline {
  let totalIn = 0;
  let totalOut = 0;
  for (const s of siblings) {
    if (stage === 'relevance') {
      totalIn += s.stages.retrieved;
      totalOut += s.stages.passedRelevance;
    } else {
      totalIn += s.stages.passedRelevance;
      totalOut += s.stages.p1Flagged;
    }
  }
  return { retention: totalIn > 0 ? totalOut / totalIn : 0, totalN: totalIn };
}

function evaluateRelevanceStage(
  source: SourceFunnel,
  siblings: SourceFunnel[],
  t: FunnelThresholds,
): FunnelCollapseResult | null {
  const { retrieved } = source.stages;
  if (retrieved < t.minRetrieved) return null;
  const retention = relevanceRetention(source.stages);
  if (retention >= t.relevanceFloor) return null;

  const base = pooledBaseline(siblings, 'relevance');
  const thin = base.totalN < t.baselineMinN;
  let severity: 'error' | 'warn';
  if (thin) severity = 'warn';
  else if (retention < t.relativeRatio * base.retention) severity = 'error';
  else return null; // whole category filters heavily by design → not anomalous

  return {
    id: `${source.category}/${source.sourceOrigin}:relevance`,
    category: source.category,
    sourceOrigin: source.sourceOrigin,
    stage: 'relevance',
    retrieved,
    retention,
    baselineRetention: base.retention,
    severity,
    reason:
      `relevance retention ${pct(retention)} on ${retrieved} retrieved` +
      (thin ? ' (no sibling baseline)' : ` vs sibling ${pct(base.retention)}`),
  };
}

function evaluateP1Stage(
  source: SourceFunnel,
  siblings: SourceFunnel[],
  t: FunnelThresholds,
): FunnelCollapseResult | null {
  const { passedRelevance } = source.stages;
  if (passedRelevance < t.minRetrieved) return null;

  const retention = p1FlagRate(source.stages);
  const base = pooledBaseline(siblings, 'p1');
  const thin = base.totalN < t.baselineMinN;

  let severity: 'error' | 'warn' | null = null;
  if (retention === 0) {
    // The #524 signature: volume in, zero flags out.
    if (thin)
      severity = 'warn'; // can't compare — suspicious but not proven
    else if (base.retention > 0) severity = 'error'; // siblings flag, this never does
    // else: siblings never flag either → quiet category, not anomalous
  } else if (retention < t.p1WarnFloor && (thin || retention < t.relativeRatio * base.retention)) {
    severity = 'warn';
  }
  if (severity === null) return null;

  return {
    id: `${source.category}/${source.sourceOrigin}:p1`,
    category: source.category,
    sourceOrigin: source.sourceOrigin,
    stage: 'p1',
    retrieved: source.stages.retrieved,
    retention,
    baselineRetention: base.retention,
    severity,
    reason:
      `P1 flag rate ${pct(retention)} on ${passedRelevance} relevant` +
      (thin ? ' (no sibling baseline)' : ` vs sibling ${pct(base.retention)}`),
  };
}

/** Evaluate one source against its category siblings; returns only breaches. */
export function evaluateSourceFunnel(
  source: SourceFunnel,
  siblings: SourceFunnel[],
  thresholds: FunnelThresholds = DEFAULT_FUNNEL_THRESHOLDS,
): FunnelCollapseResult[] {
  const out: FunnelCollapseResult[] = [];
  const rel = evaluateRelevanceStage(source, siblings, thresholds);
  if (rel) out.push(rel);
  const p1 = evaluateP1Stage(source, siblings, thresholds);
  if (p1) out.push(p1);
  return out;
}

/** Top-level: group sources by category and evaluate each against its
 *  leave-one-out siblings. Returns every collapse across all sources. */
export function evaluateFunnel(
  sources: SourceFunnel[],
  thresholds: FunnelThresholds = DEFAULT_FUNNEL_THRESHOLDS,
): FunnelCollapseResult[] {
  const byCategory = new Map<string, SourceFunnel[]>();
  for (const s of sources) {
    const arr = byCategory.get(s.category) ?? [];
    arr.push(s);
    byCategory.set(s.category, arr);
  }

  const results: FunnelCollapseResult[] = [];
  for (const s of sources) {
    const siblings = (byCategory.get(s.category) ?? []).filter((o) => o !== s);
    results.push(...evaluateSourceFunnel(s, siblings, thresholds));
  }
  return results;
}
