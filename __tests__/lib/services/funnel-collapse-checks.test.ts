import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FUNNEL_THRESHOLDS,
  evaluateFunnel,
  evaluateSourceFunnel,
  p1FlagRate,
  pooledBaseline,
  relevanceRetention,
} from '@/lib/services/funnel-collapse-checks';
import type {
  FunnelStages,
  FunnelThresholds,
  SourceFunnel,
} from '@/lib/services/funnel-collapse-checks';

// Small-N thresholds so fixtures stay readable (the defaults use 500).
const T: FunnelThresholds = {
  minRetrieved: 100,
  relevanceFloor: 0.05,
  p1WarnFloor: 0.005,
  relativeRatio: 0.2,
  baselineMinN: 100,
};

function source(
  category: string,
  sourceOrigin: string,
  stages: Partial<FunnelStages>,
): SourceFunnel {
  return {
    category,
    sourceOrigin,
    stages: { retrieved: 0, passedRelevance: 0, p1Flagged: 0, p2Confirmed: 0, ...stages },
  };
}

describe('retention math', () => {
  it('relevanceRetention and p1FlagRate guard zero denominators', () => {
    expect(
      relevanceRetention({ retrieved: 0, passedRelevance: 0, p1Flagged: 0, p2Confirmed: 0 }),
    ).toBe(0);
    expect(
      relevanceRetention({ retrieved: 200, passedRelevance: 50, p1Flagged: 0, p2Confirmed: 0 }),
    ).toBe(0.25);
    expect(p1FlagRate({ retrieved: 0, passedRelevance: 0, p1Flagged: 0, p2Confirmed: 0 })).toBe(0);
    expect(
      p1FlagRate({ retrieved: 200, passedRelevance: 100, p1Flagged: 12, p2Confirmed: 3 }),
    ).toBeCloseTo(0.12);
  });
});

describe('pooledBaseline (leave-one-out, volume-weighted)', () => {
  it('pools siblings by summed input/output, not by averaging ratios', () => {
    const siblings = [
      source('c', 'a', { retrieved: 1000, passedRelevance: 1000, p1Flagged: 200 }),
      source('c', 'b', { retrieved: 10, passedRelevance: 10, p1Flagged: 0 }),
    ];
    // p1: (200 + 0) / (1000 + 10) — the tiny sibling barely moves it.
    const base = pooledBaseline(siblings, 'p1');
    expect(base.totalN).toBe(1010);
    expect(base.retention).toBeCloseTo(200 / 1010);
  });

  it('returns zero retention with no siblings', () => {
    expect(pooledBaseline([], 'relevance')).toEqual({ retention: 0, totalN: 0 });
  });
});

describe('volume floor', () => {
  it('skips a source whose stage input is below minRetrieved', () => {
    // passedRelevance 99 < 100 → P1 stage not evaluated even at 0% flag rate.
    const s = source('c', 'x', { retrieved: 99, passedRelevance: 99, p1Flagged: 0 });
    const sibling = source('c', 'y', { retrieved: 1000, passedRelevance: 1000, p1Flagged: 150 });
    expect(evaluateSourceFunnel(s, [sibling], T)).toHaveLength(0);
  });

  it('evaluates a source exactly at minRetrieved', () => {
    const s = source('c', 'x', { retrieved: 100, passedRelevance: 100, p1Flagged: 0 });
    const sibling = source('c', 'y', { retrieved: 1000, passedRelevance: 1000, p1Flagged: 150 });
    const results = evaluateSourceFunnel(s, [sibling], T);
    expect(results).toHaveLength(1);
    expect(results[0].stage).toBe('p1');
  });
});

describe('P1 collapse — the #524 signature', () => {
  it('errors on zero flags with volume against healthy siblings', () => {
    const contaminated = source('mediaFreedom', 'federal_register', {
      retrieved: 4800,
      passedRelevance: 4800,
      p1Flagged: 0,
    });
    const healthy = source('mediaFreedom', 'gdelt', {
      retrieved: 1200,
      passedRelevance: 1200,
      p1Flagged: 130,
    });
    const collapses = evaluateFunnel([contaminated, healthy], T);
    expect(collapses).toHaveLength(1);
    expect(collapses[0]).toMatchObject({
      category: 'mediaFreedom',
      sourceOrigin: 'federal_register',
      stage: 'p1',
      severity: 'error',
    });
  });

  it('does NOT alert when the whole category legitimately never flags', () => {
    const a = source('quiet', 'a', { retrieved: 1000, passedRelevance: 1000, p1Flagged: 0 });
    const b = source('quiet', 'b', { retrieved: 1000, passedRelevance: 1000, p1Flagged: 0 });
    expect(evaluateFunnel([a, b], T)).toHaveLength(0);
  });

  it('warns (not errors) on zero flags with no sibling baseline', () => {
    const lone = source('solo', 'only', { retrieved: 1000, passedRelevance: 1000, p1Flagged: 0 });
    const results = evaluateSourceFunnel(lone, [], T);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ stage: 'p1', severity: 'warn' });
  });

  it('warns on a low-but-nonzero rate far below siblings', () => {
    const weak = source('c', 'weak', { retrieved: 5000, passedRelevance: 5000, p1Flagged: 10 }); // 0.2%
    const strong = source('c', 'strong', {
      retrieved: 5000,
      passedRelevance: 5000,
      p1Flagged: 600,
    }); // 12%
    const results = evaluateSourceFunnel(weak, [strong], T);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ stage: 'p1', severity: 'warn' });
  });

  it('does NOT alert on a low rate when the whole category is uniformly low', () => {
    // Both ~0.3% — below the warn floor, but neither is anomalous vs the other.
    const a = source('c', 'a', { retrieved: 5000, passedRelevance: 5000, p1Flagged: 15 });
    const b = source('c', 'b', { retrieved: 5000, passedRelevance: 5000, p1Flagged: 15 });
    expect(evaluateFunnel([a, b], T)).toHaveLength(0);
  });
});

describe('relevance collapse', () => {
  it('errors when the filter drops nearly everything vs healthy siblings', () => {
    const contaminated = source('c', 'bad', {
      retrieved: 5000,
      passedRelevance: 100, // 2% retention
      p1Flagged: 20,
    });
    const healthy = source('c', 'good', {
      retrieved: 5000,
      passedRelevance: 4800, // 96%
      p1Flagged: 500,
    });
    const results = evaluateSourceFunnel(contaminated, [healthy], T);
    const rel = results.find((r) => r.stage === 'relevance');
    expect(rel).toMatchObject({ severity: 'error' });
  });

  it('does NOT alert when the whole category filters heavily by design', () => {
    const a = source('c', 'a', { retrieved: 5000, passedRelevance: 150, p1Flagged: 30 }); // 3%
    const b = source('c', 'b', { retrieved: 5000, passedRelevance: 150, p1Flagged: 30 }); // 3%
    const relCollapses = evaluateFunnel([a, b], T).filter((r) => r.stage === 'relevance');
    expect(relCollapses).toHaveLength(0);
  });

  it('leaves a healthy source with no collapses', () => {
    const s = source('c', 'ok', {
      retrieved: 3000,
      passedRelevance: 3000,
      p1Flagged: 300,
      p2Confirmed: 90,
    });
    const sibling = source('c', 'ok2', { retrieved: 3000, passedRelevance: 3000, p1Flagged: 300 });
    expect(evaluateSourceFunnel(s, [sibling], T)).toHaveLength(0);
  });
});

describe('default thresholds', () => {
  it('exposes the production constants', () => {
    expect(DEFAULT_FUNNEL_THRESHOLDS.minRetrieved).toBe(500);
    expect(DEFAULT_FUNNEL_THRESHOLDS.relativeRatio).toBe(0.2);
  });
});
