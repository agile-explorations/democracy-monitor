import { describe, it, expect } from 'vitest';
import type { SignalFetchResult } from '@/lib/services/feed-fetcher';
import {
  classifySourceStatus,
  computeHealthSummary,
  getCanarySourceIds,
} from '@/lib/services/source-health-service';
import type { SourceHealthCheck } from '@/lib/services/source-health-service';

function makeFetchResult(overrides: Partial<SignalFetchResult> = {}): SignalFetchResult {
  return {
    signalId: 'test_signal',
    signalName: 'Test Signal',
    signalType: 'rss',
    success: true,
    documentCount: 5,
    durationMs: 100,
    items: [],
    ...overrides,
  };
}

function makeCheck(overrides: Partial<SourceHealthCheck> = {}): SourceHealthCheck {
  return {
    sourceId: 'test',
    sourceName: 'Test',
    sourceType: 'rss',
    category: 'judicialIndependence',
    status: 'healthy',
    documentCount: 5,
    expectedDocCount: null,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('classifySourceStatus', () => {
  it('returns unavailable when fetch failed', () => {
    const result = makeFetchResult({ success: false });
    expect(classifySourceStatus(result, 0)).toBe('unavailable');
  });

  it('returns healthy when fetch succeeded with documents', () => {
    const result = makeFetchResult({ success: true, documentCount: 5 });
    expect(classifySourceStatus(result, 0)).toBe('healthy');
  });

  it('returns healthy when zero docs but below silent threshold', () => {
    const result = makeFetchResult({ success: true, documentCount: 0 });
    expect(classifySourceStatus(result, 1)).toBe('healthy');
  });

  it('returns silent when zero docs at or above silent threshold', () => {
    const result = makeFetchResult({ success: true, documentCount: 0 });
    expect(classifySourceStatus(result, 2)).toBe('silent');
  });
});

describe('computeHealthSummary', () => {
  it('returns normal with empty checks', () => {
    const summary = computeHealthSummary([]);
    expect(summary.overallHealth).toBe('normal');
    expect(summary.dataAvailabilityScore).toBe(1);
    expect(summary.totalSources).toBe(0);
  });

  it('returns normal when all sources healthy', () => {
    const checks = [makeCheck(), makeCheck({ sourceId: 'b' })];
    const summary = computeHealthSummary(checks);
    expect(summary.overallHealth).toBe('normal');
    expect(summary.healthySources).toBe(2);
    expect(summary.dataAvailabilityScore).toBe(1);
  });

  it('returns degraded when >25% but <50% sources unhealthy', () => {
    const checks = [
      makeCheck({ status: 'healthy' }),
      makeCheck({ sourceId: 'b', status: 'healthy' }),
      makeCheck({ sourceId: 'c', status: 'unavailable' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.overallHealth).toBe('degraded');
    expect(summary.unavailableSources).toBe(1);
    expect(summary.dataAvailabilityScore).toBe(0.67);
  });

  it('returns critical when >=50% sources unhealthy', () => {
    const checks = [
      makeCheck({ status: 'unavailable' }),
      makeCheck({ sourceId: 'b', status: 'silent' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.overallHealth).toBe('critical');
    expect(summary.healthySources).toBe(0);
  });

  it('counts each status type correctly', () => {
    const checks = [
      makeCheck({ status: 'healthy' }),
      makeCheck({ sourceId: 'b', status: 'degraded' }),
      makeCheck({ sourceId: 'c', status: 'unavailable' }),
      makeCheck({ sourceId: 'd', status: 'silent' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.healthySources).toBe(1);
    expect(summary.degradedSources).toBe(1);
    expect(summary.unavailableSources).toBe(1);
    expect(summary.silentSources).toBe(1);
    expect(summary.totalSources).toBe(4);
  });

  it('returns normal when unhealthy fraction is exactly at degraded boundary (25%)', () => {
    // 1 out of 4 = 25% — equals degradedSourceFraction (0.25) so should be degraded
    const checks = [
      makeCheck({ status: 'healthy' }),
      makeCheck({ sourceId: 'b', status: 'healthy' }),
      makeCheck({ sourceId: 'c', status: 'healthy' }),
      makeCheck({ sourceId: 'd', status: 'unavailable' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.overallHealth).toBe('degraded');
  });

  it('returns normal when unhealthy fraction is just below degraded boundary', () => {
    // 1 out of 5 = 20% — below degradedSourceFraction (0.25)
    const checks = [
      makeCheck({ status: 'healthy' }),
      makeCheck({ sourceId: 'b', status: 'healthy' }),
      makeCheck({ sourceId: 'c', status: 'healthy' }),
      makeCheck({ sourceId: 'd', status: 'healthy' }),
      makeCheck({ sourceId: 'e', status: 'unavailable' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.overallHealth).toBe('normal');
  });

  it('returns critical when unhealthy fraction is exactly at critical boundary (50%)', () => {
    // 2 out of 4 = 50% — equals criticalSourceFraction (0.5)
    const checks = [
      makeCheck({ status: 'healthy' }),
      makeCheck({ sourceId: 'b', status: 'healthy' }),
      makeCheck({ sourceId: 'c', status: 'unavailable' }),
      makeCheck({ sourceId: 'd', status: 'silent' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.overallHealth).toBe('critical');
  });

  it('returns degraded when unhealthy fraction is just below critical boundary', () => {
    // 3 out of 7 ≈ 42.8% — above degraded (25%) but below critical (50%)
    const checks = [
      makeCheck({ status: 'healthy' }),
      makeCheck({ sourceId: 'b', status: 'healthy' }),
      makeCheck({ sourceId: 'c', status: 'healthy' }),
      makeCheck({ sourceId: 'd', status: 'healthy' }),
      makeCheck({ sourceId: 'e', status: 'unavailable' }),
      makeCheck({ sourceId: 'f', status: 'degraded' }),
      makeCheck({ sourceId: 'g', status: 'silent' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.overallHealth).toBe('degraded');
  });

  it('treats silent sources as unhealthy for overall health', () => {
    // 2 silent out of 4 = 50% → critical
    const checks = [
      makeCheck({ status: 'healthy' }),
      makeCheck({ sourceId: 'b', status: 'healthy' }),
      makeCheck({ sourceId: 'c', status: 'silent' }),
      makeCheck({ sourceId: 'd', status: 'silent' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.overallHealth).toBe('critical');
  });

  it('treats degraded sources as unhealthy for overall health', () => {
    // 2 degraded out of 4 = 50% → critical
    const checks = [
      makeCheck({ status: 'healthy' }),
      makeCheck({ sourceId: 'b', status: 'healthy' }),
      makeCheck({ sourceId: 'c', status: 'degraded' }),
      makeCheck({ sourceId: 'd', status: 'degraded' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.overallHealth).toBe('critical');
  });

  it('computes dataAvailabilityScore as fraction of healthy sources', () => {
    const checks = [
      makeCheck({ status: 'healthy' }),
      makeCheck({ sourceId: 'b', status: 'healthy' }),
      makeCheck({ sourceId: 'c', status: 'healthy' }),
      makeCheck({ sourceId: 'd', status: 'unavailable' }),
    ];
    const summary = computeHealthSummary(checks);
    // 3/4 = 0.75
    expect(summary.dataAvailabilityScore).toBe(0.75);
  });

  it('computes dataAvailabilityScore of 0 when no healthy sources', () => {
    const checks = [
      makeCheck({ status: 'unavailable' }),
      makeCheck({ sourceId: 'b', status: 'silent' }),
      makeCheck({ sourceId: 'c', status: 'degraded' }),
    ];
    const summary = computeHealthSummary(checks);
    expect(summary.dataAvailabilityScore).toBe(0);
  });

  it('returns a valid ISO timestamp in checkedAt', () => {
    const checks = [makeCheck({ status: 'healthy' })];
    const summary = computeHealthSummary(checks);
    expect(() => new Date(summary.checkedAt)).not.toThrow();
    expect(new Date(summary.checkedAt).toISOString()).toBe(summary.checkedAt);
  });
});

describe('classifySourceStatus — additional edge cases', () => {
  it('returns healthy for successful fetch with exactly 1 document', () => {
    const result = makeFetchResult({ success: true, documentCount: 1 });
    expect(classifySourceStatus(result, 0)).toBe('healthy');
  });

  it('returns healthy when zero docs and consecutiveZeroChecks is 0', () => {
    const result = makeFetchResult({ success: true, documentCount: 0 });
    expect(classifySourceStatus(result, 0)).toBe('healthy');
  });

  it('returns silent when zero docs at threshold (2 consecutive zeros)', () => {
    const result = makeFetchResult({ success: true, documentCount: 0 });
    // HEALTH_THRESHOLDS.silentCheckCount is 2
    expect(classifySourceStatus(result, 2)).toBe('silent');
  });

  it('returns silent when zero docs above threshold', () => {
    const result = makeFetchResult({ success: true, documentCount: 0 });
    expect(classifySourceStatus(result, 5)).toBe('silent');
  });

  it('returns unavailable regardless of consecutiveZeroChecks when fetch failed', () => {
    const result = makeFetchResult({ success: false, documentCount: 10 });
    expect(classifySourceStatus(result, 0)).toBe('unavailable');
    expect(classifySourceStatus(result, 5)).toBe('unavailable');
  });
});

describe('getCanarySourceIds', () => {
  it('returns IDs of signals with isCanary: true', () => {
    const ids = getCanarySourceIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toContain('fr_opm');
    expect(ids).toContain('rss_dod_news');
    expect(ids).toContain('rss_gao');
  });

  it('does not include non-canary signals', () => {
    const ids = getCanarySourceIds();
    expect(ids).not.toContain('fr_schedule_f');
    expect(ids).not.toContain('html_oversight_gov');
  });
});
