import { describe, it, expect } from 'vitest';
import {
  detectAnomalies,
  calculateTrends,
  countKeywordsInItems,
} from '@/lib/services/trend-anomaly-service';
import type { KeywordTrend } from '@/lib/types/trends';

describe('calculateTrends', () => {
  it('calculates ratio of current to baseline', () => {
    const current = { 'schedule f': 10 };
    const baseline = { 'schedule f': 5 };
    const trends = calculateTrends(current, baseline, 'civilService');

    expect(trends).toHaveLength(1);
    expect(trends[0].keyword).toBe('schedule f');
    expect(trends[0].ratio).toBe(2);
    expect(trends[0].currentCount).toBe(10);
    expect(trends[0].baselineAvg).toBe(5);
  });

  it('marks as anomaly when ratio >= 2 and count >= 2', () => {
    const current = { impoundment: 6 };
    const baseline = { impoundment: 2 };
    const trends = calculateTrends(current, baseline, 'fiscal');

    expect(trends[0].isAnomaly).toBe(true);
  });

  it('does not mark as anomaly when count < 2', () => {
    const current = { impoundment: 1 };
    const baseline = { impoundment: 0.3 };
    const trends = calculateTrends(current, baseline, 'fiscal');

    expect(trends[0].isAnomaly).toBe(false);
  });

  it('does not mark as anomaly when ratio < 2', () => {
    const current = { impoundment: 3 };
    const baseline = { impoundment: 2 };
    const trends = calculateTrends(current, baseline, 'fiscal');

    expect(trends[0].ratio).toBe(1.5);
    expect(trends[0].isAnomaly).toBe(false);
  });

  it('returns Infinity ratio for new keywords with no baseline', () => {
    const current = { 'new keyword': 5 };
    const baseline = {};
    const trends = calculateTrends(current, baseline, 'fiscal');

    expect(trends[0].ratio).toBe(Infinity);
    expect(trends[0].isAnomaly).toBe(true);
  });

  it('returns 0 ratio when both current and baseline are 0', () => {
    const current = { nothing: 0 };
    const baseline = { nothing: 0 };
    const trends = calculateTrends(current, baseline, 'fiscal');

    expect(trends[0].ratio).toBe(0);
  });

  it('includes period timestamps', () => {
    const trends = calculateTrends({ test: 1 }, {}, 'fiscal');
    expect(trends[0].periodStart).toBeTruthy();
    expect(trends[0].periodEnd).toBeTruthy();
    // Period should span about 7 days
    const start = new Date(trends[0].periodStart).getTime();
    const end = new Date(trends[0].periodEnd).getTime();
    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeCloseTo(7, 0);
  });
});

describe('detectAnomalies', () => {
  const baseTrend: KeywordTrend = {
    keyword: 'test',
    category: 'fiscal',
    currentCount: 10,
    baselineAvg: 2,
    ratio: 5,
    isAnomaly: true,
    periodStart: '2026-01-01T00:00:00Z',
    periodEnd: '2026-01-08T00:00:00Z',
  };

  it('converts anomalous trends to anomaly alerts', () => {
    const trends = [baseTrend];
    const anomalies = detectAnomalies(trends);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].keyword).toBe('test');
    expect(anomalies[0].category).toBe('fiscal');
    expect(anomalies[0].ratio).toBe(5);
  });

  it('assigns high severity for ratio >= 5', () => {
    const anomalies = detectAnomalies([{ ...baseTrend, ratio: 5 }]);
    expect(anomalies[0].severity).toBe('high');
  });

  it('assigns medium severity for ratio >= 3', () => {
    const anomalies = detectAnomalies([{ ...baseTrend, ratio: 3.5 }]);
    expect(anomalies[0].severity).toBe('medium');
  });

  it('assigns low severity for ratio >= 2', () => {
    const anomalies = detectAnomalies([{ ...baseTrend, ratio: 2.5 }]);
    expect(anomalies[0].severity).toBe('low');
  });

  it('skips non-anomalous trends', () => {
    const trends = [{ ...baseTrend, isAnomaly: false }];
    const anomalies = detectAnomalies(trends);
    expect(anomalies).toHaveLength(0);
  });

  it('generates a descriptive message', () => {
    const anomalies = detectAnomalies([baseTrend]);
    expect(anomalies[0].message).toContain('"test"');
    expect(anomalies[0].message).toContain('10 times');
    expect(anomalies[0].message).toContain('5.0x');
  });

  it('returns empty array for empty input', () => {
    expect(detectAnomalies([])).toHaveLength(0);
  });
});

describe('countKeywordsInItems', () => {
  it('counts matching keywords in item titles', () => {
    const items = [
      { title: 'Schedule F reclassification announced' },
      { title: 'More about Schedule F implementation' },
      { title: 'Workforce reduction in progress' },
    ];
    const counts = countKeywordsInItems(items, 'civilService');

    expect(counts['schedule f']).toBe(2);
    expect(counts['reclassification']).toBe(1);
    expect(counts['workforce reduction']).toBe(1);
  });

  it('is case insensitive', () => {
    const items = [{ title: 'SCHEDULE F ANNOUNCED TODAY' }];
    const counts = countKeywordsInItems(items, 'civilService');
    expect(counts['schedule f']).toBe(1);
  });

  it('only returns keywords with count > 0', () => {
    const items = [{ title: 'Nothing interesting happening' }];
    const counts = countKeywordsInItems(items, 'civilService');
    expect(Object.keys(counts)).toHaveLength(0);
  });

  it('returns empty for unknown category', () => {
    const items = [{ title: 'Something' }];
    const counts = countKeywordsInItems(items, 'nonexistent');
    expect(Object.keys(counts)).toHaveLength(0);
  });

  it('counts across multiple severity tiers', () => {
    const items = [
      { title: 'Illegal impoundment by the executive branch' }, // capture keyword
      { title: 'New rescission proposal under review' }, // drift keyword
      { title: 'Funding delay reported for the quarter' }, // warning keyword
    ];
    const counts = countKeywordsInItems(items, 'fiscal');

    expect(counts['illegal impoundment']).toBe(1);
    expect(counts['rescission']).toBe(1);
    expect(counts['funding delay']).toBe(1);
  });

  it('handles empty items array', () => {
    const counts = countKeywordsInItems([], 'civilService');
    expect(Object.keys(counts)).toHaveLength(0);
  });
});
