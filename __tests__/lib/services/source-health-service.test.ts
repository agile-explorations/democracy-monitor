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
    category: 'courts',
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
