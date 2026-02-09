import { describe, expect, it } from 'vitest';
import { SEED_VALIDATION_DATA } from '@/lib/data/validation/seed-data';
import type { ValidationSource } from '@/lib/types/validation';

const VALID_SOURCES: ValidationSource[] = ['v-dem', 'freedom-house', 'bright-line-watch'];

describe('SEED_VALIDATION_DATA', () => {
  it('has a reasonable number of data points', () => {
    expect(SEED_VALIDATION_DATA.length).toBeGreaterThanOrEqual(10);
    expect(SEED_VALIDATION_DATA.length).toBeLessThanOrEqual(50);
  });

  it('all data points have required fields', () => {
    for (const point of SEED_VALIDATION_DATA) {
      expect(point.source).toBeTruthy();
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(point.dimension).toBeTruthy();
      expect(typeof point.score).toBe('number');
    }
  });

  it('all scores are within valid range (0-1)', () => {
    for (const point of SEED_VALIDATION_DATA) {
      expect(point.score).toBeGreaterThanOrEqual(0);
      expect(point.score).toBeLessThanOrEqual(1);
    }
  });

  it('all sources are valid ValidationSource values', () => {
    for (const point of SEED_VALIDATION_DATA) {
      expect(VALID_SOURCES).toContain(point.source);
    }
  });

  it('includes data from all three sources', () => {
    const sources = new Set(SEED_VALIDATION_DATA.map((d) => d.source));
    expect(sources.has('v-dem')).toBe(true);
    expect(sources.has('freedom-house')).toBe(true);
    expect(sources.has('bright-line-watch')).toBe(true);
  });

  it('rawScore is non-negative when present', () => {
    for (const point of SEED_VALIDATION_DATA) {
      if (point.rawScore !== undefined) {
        expect(point.rawScore).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
