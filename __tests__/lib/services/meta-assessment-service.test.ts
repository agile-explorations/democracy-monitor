import { describe, it, expect } from 'vitest';
import {
  classifyCanaryStatus,
  classifyDataIntegrity,
  buildMetaSummary,
  buildAlerts,
  computeMetaAssessment,
} from '@/lib/services/meta-assessment-service';
import type { SourceHealthCheck, SourceHealthSummary } from '@/lib/services/source-health-service';

function makeCheck(overrides: Partial<SourceHealthCheck> = {}): SourceHealthCheck {
  return {
    sourceId: 'test',
    sourceName: 'Test Source',
    sourceType: 'rss',
    category: 'judicialIndependence',
    status: 'healthy',
    documentCount: 5,
    expectedDocCount: null,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSummary(overrides: Partial<SourceHealthSummary> = {}): SourceHealthSummary {
  return {
    totalSources: 8,
    healthySources: 8,
    degradedSources: 0,
    unavailableSources: 0,
    silentSources: 0,
    overallHealth: 'normal',
    dataAvailabilityScore: 1,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('classifyDataIntegrity', () => {
  it.each([
    [1.0, 'high'],
    [0.8, 'high'],
    [0.79, 'moderate'],
    [0.5, 'moderate'],
    [0.49, 'low'],
    [0.25, 'low'],
    [0.24, 'critical'],
    [0, 'critical'],
  ] as const)('score %f → %s', (score, expected) => {
    expect(classifyDataIntegrity(score)).toBe(expected);
  });
});

describe('classifyCanaryStatus', () => {
  it('returns all_ok when no checks', () => {
    expect(classifyCanaryStatus([])).toBe('all_ok');
  });

  it('returns all_ok when all canary sources healthy', () => {
    const checks = [makeCheck({ sourceId: 'fr_opm', status: 'healthy' })];
    expect(classifyCanaryStatus(checks)).toBe('all_ok');
  });

  it('returns some_silent when some canary sources down', () => {
    const checks = [
      makeCheck({ sourceId: 'fr_opm', status: 'healthy' }),
      makeCheck({ sourceId: 'rss_dod_news', status: 'unavailable' }),
      makeCheck({ sourceId: 'fr_dod', status: 'healthy' }),
    ];
    expect(classifyCanaryStatus(checks)).toBe('some_silent');
  });

  it('returns critical_silent when >=50% canary sources down', () => {
    const checks = [
      makeCheck({ sourceId: 'fr_opm', status: 'unavailable' }),
      makeCheck({ sourceId: 'rss_dod_news', status: 'silent' }),
    ];
    expect(classifyCanaryStatus(checks)).toBe('critical_silent');
  });

  it('ignores non-canary sources', () => {
    const checks = [makeCheck({ sourceId: 'fr_schedule_f', status: 'unavailable' })];
    expect(classifyCanaryStatus(checks)).toBe('all_ok');
  });
});

describe('buildMetaSummary', () => {
  it('returns normal message for high integrity', () => {
    expect(buildMetaSummary('high', makeSummary())).toBe('All data sources operating normally.');
  });

  it('includes source counts for low integrity', () => {
    const summary = makeSummary({ healthySources: 3, totalSources: 8 });
    const result = buildMetaSummary('low', summary);
    expect(result).toContain('3 of 8 sources healthy');
  });

  it('warns about unreliability at critical', () => {
    const result = buildMetaSummary('critical', makeSummary());
    expect(result).toContain('should NOT be treated as reliable');
  });
});

describe('buildAlerts', () => {
  it('returns empty array for healthy checks', () => {
    expect(buildAlerts([makeCheck()])).toEqual([]);
  });

  it('includes unavailable sources with error messages', () => {
    const alerts = buildAlerts([makeCheck({ status: 'unavailable', errorMessage: 'timeout' })]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('unavailable');
    expect(alerts[0]).toContain('timeout');
  });

  it('includes silent sources', () => {
    const alerts = buildAlerts([makeCheck({ status: 'silent' })]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('silent');
  });
});

describe('computeMetaAssessment', () => {
  it('returns high integrity when all healthy', () => {
    const meta = computeMetaAssessment(makeSummary(), [makeCheck()]);
    expect(meta.dataIntegrity).toBe('high');
    expect(meta.integrityScore).toBe(1);
    expect(meta.canaryStatus).toBe('all_ok');
  });

  it('downgrades from high to moderate when canary sources critical', () => {
    const summary = makeSummary({ dataAvailabilityScore: 0.85 });
    const checks = [
      makeCheck({ sourceId: 'fr_opm', status: 'unavailable' }),
      makeCheck({ sourceId: 'rss_dod_news', status: 'silent' }),
    ];
    const meta = computeMetaAssessment(summary, checks);
    expect(meta.dataIntegrity).toBe('moderate');
    expect(meta.canaryStatus).toBe('critical_silent');
  });

  it('returns critical when availability is very low', () => {
    const summary = makeSummary({
      dataAvailabilityScore: 0.1,
      healthySources: 1,
      totalSources: 10,
      overallHealth: 'critical',
    });
    const meta = computeMetaAssessment(summary, []);
    expect(meta.dataIntegrity).toBe('critical');
    expect(meta.summary).toContain('should NOT be treated as reliable');
  });
});
