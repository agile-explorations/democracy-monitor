import { describe, it, expect } from 'vitest';
import { calculateDataCoverage } from '@/lib/services/confidence-scoring';
import type { AssessmentResult } from '@/lib/types';

function makeResult(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    status: 'Warning',
    reason: 'test',
    matches: [],
    ...overrides,
  };
}

describe('calculateDataCoverage', () => {
  it('returns a confidence between 0 and 1', () => {
    const items = [{ title: 'Test item', agency: 'GAO' }];
    const result = makeResult({ matches: ['test'] });
    const { confidence } = calculateDataCoverage(items, result);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('increases with more diverse sources', () => {
    const fewSources = [
      { title: 'Item 1', agency: 'GAO' },
    ];
    const manySources = [
      { title: 'Item 1', agency: 'GAO' },
      { title: 'Item 2', agency: 'DOJ' },
      { title: 'Item 3', agency: 'OPM' },
      { title: 'Item 4', agency: 'Treasury' },
    ];
    const result = makeResult({ matches: ['test'] });

    const { factors: fewFactors } = calculateDataCoverage(fewSources, result);
    const { factors: manyFactors } = calculateDataCoverage(manySources, result);

    expect(manyFactors.sourceDiversity).toBeGreaterThan(fewFactors.sourceDiversity);
  });

  it('increases authority weight with authoritative sources', () => {
    const noAuthority = [
      { title: 'Regular news item' },
    ];
    const highAuthority = [
      { title: 'GAO decision on impoundment', agency: 'GAO' },
      { title: 'Court order compliance report', agency: 'Federal Courts' },
      { title: 'Inspector General finding', agency: 'IG Office' },
    ];
    const result = makeResult({ matches: ['test'] });

    const { factors: noAuthFactors } = calculateDataCoverage(noAuthority, result);
    const { factors: highAuthFactors } = calculateDataCoverage(highAuthority, result);

    expect(highAuthFactors.authorityWeight).toBeGreaterThan(noAuthFactors.authorityWeight);
  });

  it('increases evidence coverage with more items', () => {
    const fewItems = [{ title: 'Item 1' }];
    const manyItems = Array.from({ length: 10 }, (_, i) => ({ title: `Item ${i}` }));
    const result = makeResult();

    const { factors: fewFactors } = calculateDataCoverage(fewItems, result);
    const { factors: manyFactors } = calculateDataCoverage(manyItems, result);

    expect(manyFactors.evidenceCoverage).toBeGreaterThan(fewFactors.evidenceCoverage);
  });

  it('increases keyword density with more matches', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ title: `Item ${i}` }));
    const noMatches = makeResult({ matches: [] });
    const manyMatches = makeResult({ matches: ['a', 'b', 'c', 'd', 'e'] });

    const { factors: noMatchFactors } = calculateDataCoverage(items, noMatches);
    const { factors: manyMatchFactors } = calculateDataCoverage(items, manyMatches);

    expect(manyMatchFactors.keywordDensity).toBeGreaterThan(noMatchFactors.keywordDensity);
  });

  it('sets AI agreement to 1 when keyword and AI status match', () => {
    const items = [{ title: 'Item' }];
    const result = makeResult({ status: 'Drift' });
    const { factors } = calculateDataCoverage(items, result, 'Drift');
    expect(factors.aiAgreement).toBe(1);
  });

  it('sets AI agreement to 0.7 when statuses are adjacent', () => {
    const items = [{ title: 'Item' }];
    const result = makeResult({ status: 'Drift' });
    const { factors } = calculateDataCoverage(items, result, 'Warning');
    expect(factors.aiAgreement).toBe(0.7);
  });

  it('sets AI agreement to 0.4 when statuses are 2 apart', () => {
    const items = [{ title: 'Item' }];
    const result = makeResult({ status: 'Capture' });
    const { factors } = calculateDataCoverage(items, result, 'Warning');
    expect(factors.aiAgreement).toBe(0.4);
  });

  it('sets AI agreement to 0.2 when statuses are 3 apart', () => {
    const items = [{ title: 'Item' }];
    const result = makeResult({ status: 'Capture' });
    const { factors } = calculateDataCoverage(items, result, 'Stable');
    expect(factors.aiAgreement).toBe(0.2);
  });

  it('defaults AI agreement to 0.5 when no AI status provided', () => {
    const items = [{ title: 'Item' }];
    const result = makeResult();
    const { factors } = calculateDataCoverage(items, result);
    expect(factors.aiAgreement).toBe(0.5);
  });

  it('filters out error and warning items', () => {
    const items = [
      { title: 'Real item', agency: 'GAO' },
      { title: 'Error', isError: true },
      { title: 'Warning', isWarning: true },
    ];
    const result = makeResult({ matches: ['real'] });
    const { factors } = calculateDataCoverage(items, result);
    // Only 1 valid item out of 3, so coverage should be 0.1 (1/10)
    expect(factors.evidenceCoverage).toBe(0.1);
  });
});
