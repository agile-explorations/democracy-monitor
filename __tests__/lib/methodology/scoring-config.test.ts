import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_COUNT_MAX,
  CLASS_MULTIPLIERS,
  CONVERGENCE_ENTRENCHED_THRESHOLD,
  DATA_COVERAGE_WEIGHTS,
  DECAY_HALF_LIFE_WEEKS,
  EVIDENCE_COUNT_MAX,
  KEYWORD_DENSITY_RATIO,
  NEGATION_WINDOW_AFTER,
  NEGATION_WINDOW_BEFORE,
  SEMANTIC_DRIFT_ANOMALY_THRESHOLD,
  SEMANTIC_DRIFT_ELEVATED_THRESHOLD,
  SOURCE_DIVERSITY_MAX,
  TIER_WEIGHTS,
  computeSeverityScore,
} from '@/lib/methodology/scoring-config';

describe('scoring-config', () => {
  describe('DATA_COVERAGE_WEIGHTS', () => {
    it('sums to 1.0', () => {
      const sum = Object.values(DATA_COVERAGE_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('has all positive weights', () => {
      for (const [key, value] of Object.entries(DATA_COVERAGE_WEIGHTS)) {
        expect(value, `${key} should be positive`).toBeGreaterThan(0);
      }
    });
  });

  describe('TIER_WEIGHTS', () => {
    it('orders capture > drift > warning', () => {
      expect(TIER_WEIGHTS.capture).toBeGreaterThan(TIER_WEIGHTS.drift);
      expect(TIER_WEIGHTS.drift).toBeGreaterThan(TIER_WEIGHTS.warning);
    });

    it('has all positive weights', () => {
      for (const [key, value] of Object.entries(TIER_WEIGHTS)) {
        expect(value, `${key} should be positive`).toBeGreaterThan(0);
      }
    });
  });

  describe('CLASS_MULTIPLIERS', () => {
    it('has all positive multipliers', () => {
      for (const [key, value] of Object.entries(CLASS_MULTIPLIERS)) {
        expect(value, `${key} should be positive`).toBeGreaterThan(0);
      }
    });

    it('ranks executive_order highest', () => {
      expect(CLASS_MULTIPLIERS.executive_order).toBeGreaterThanOrEqual(
        Math.max(...Object.values(CLASS_MULTIPLIERS)),
      );
    });
  });

  describe('threshold constants', () => {
    it('has positive thresholds', () => {
      expect(SOURCE_DIVERSITY_MAX).toBeGreaterThan(0);
      expect(AUTHORITY_COUNT_MAX).toBeGreaterThan(0);
      expect(EVIDENCE_COUNT_MAX).toBeGreaterThan(0);
      expect(KEYWORD_DENSITY_RATIO).toBeGreaterThan(0);
      expect(KEYWORD_DENSITY_RATIO).toBeLessThanOrEqual(1);
    });

    it('has positive negation windows', () => {
      expect(NEGATION_WINDOW_BEFORE).toBeGreaterThan(0);
      expect(NEGATION_WINDOW_AFTER).toBeGreaterThan(0);
    });

    it('has sensible decay half-life', () => {
      expect(DECAY_HALF_LIFE_WEEKS).toBeGreaterThan(0);
    });

    it('orders semantic drift thresholds correctly', () => {
      expect(SEMANTIC_DRIFT_ANOMALY_THRESHOLD).toBeGreaterThan(SEMANTIC_DRIFT_ELEVATED_THRESHOLD);
    });

    it('has positive convergence threshold', () => {
      expect(CONVERGENCE_ENTRENCHED_THRESHOLD).toBeGreaterThan(0);
    });
  });

  describe('computeSeverityScore', () => {
    it('returns 0 for no matches', () => {
      expect(computeSeverityScore(0, 0, 0)).toBe(0);
    });

    it('applies log2 to capture counts', () => {
      const oneCapture = computeSeverityScore(1, 0, 0);
      const twoCapture = computeSeverityScore(2, 0, 0);
      expect(oneCapture).toBeCloseTo(4.0, 2);
      expect(twoCapture).toBeCloseTo(6.34, 1);
      // Diminishing returns
      expect(twoCapture - oneCapture).toBeLessThan(oneCapture);
    });

    it('applies linear scaling to drift and warning', () => {
      expect(computeSeverityScore(0, 1, 0)).toBe(TIER_WEIGHTS.drift);
      expect(computeSeverityScore(0, 3, 0)).toBe(3 * TIER_WEIGHTS.drift);
      expect(computeSeverityScore(0, 0, 5)).toBe(5 * TIER_WEIGHTS.warning);
    });
  });
});
