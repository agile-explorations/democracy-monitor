import { describe, it, expect } from 'vitest';
import {
  getStructuralThreshold,
  STRUCTURAL_ANOMALY_THRESHOLD,
  CATEGORY_STRUCTURAL_THRESHOLDS,
} from '@/lib/methodology/scoring-config';

describe('getStructuralThreshold', () => {
  it('returns global threshold for categories not in override map', () => {
    expect(getStructuralThreshold('fiscal')).toBe(STRUCTURAL_ANOMALY_THRESHOLD);
  });

  it('returns global threshold for empty string', () => {
    expect(getStructuralThreshold('')).toBe(STRUCTURAL_ANOMALY_THRESHOLD);
  });

  it('returns global threshold for unknown category', () => {
    expect(getStructuralThreshold('nonexistent_category')).toBe(STRUCTURAL_ANOMALY_THRESHOLD);
  });

  it('returns override value when category has one', () => {
    // Temporarily set a threshold for testing
    const original = { ...CATEGORY_STRUCTURAL_THRESHOLDS };
    (CATEGORY_STRUCTURAL_THRESHOLDS as Record<string, number>)['test_category'] = 4.0;

    expect(getStructuralThreshold('test_category')).toBe(4.0);

    // Cleanup
    delete (CATEGORY_STRUCTURAL_THRESHOLDS as Record<string, number>)['test_category'];
    Object.assign(CATEGORY_STRUCTURAL_THRESHOLDS, original);
  });

  it('global threshold is 2.5', () => {
    expect(STRUCTURAL_ANOMALY_THRESHOLD).toBe(2.5);
  });
});
