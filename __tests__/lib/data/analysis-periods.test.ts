import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAnalysisPeriods,
  isInAnalysisPeriod,
  ACTIVE_SOURCES,
} from '@/lib/data/analysis-periods';

describe('analysis-periods', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-05'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getAnalysisPeriods', () => {
    it('returns all baseline periods plus T2', () => {
      const periods = getAnalysisPeriods();
      const labels = periods.map((p) => p.label);

      expect(labels).toContain('biden_2022');
      expect(labels).toContain('biden_2021');
      expect(labels).toContain('trump_2017');
      expect(labels).toContain('trump_2018');
      expect(labels).toContain('trump_t2');
    });

    it('T2 period starts at inauguration and ends at today', () => {
      const t2 = getAnalysisPeriods().find((p) => p.label === 'trump_t2')!;

      expect(t2.from).toBe('2025-01-20');
      expect(t2.to).toBe('2026-03-05');
    });

    it('baseline periods match BASELINE_CONFIGS dates', () => {
      const periods = getAnalysisPeriods();
      const biden2022 = periods.find((p) => p.label === 'biden_2022')!;

      expect(biden2022.from).toBe('2022-01-20');
      expect(biden2022.to).toBe('2023-01-19');
    });
  });

  describe('isInAnalysisPeriod', () => {
    it('returns true for a date within a baseline period', () => {
      expect(isInAnalysisPeriod('2022-06-15')).toBe(true);
    });

    it('returns true for a date within T2', () => {
      expect(isInAnalysisPeriod('2025-06-01')).toBe(true);
    });

    it('returns false for a gap-year date (2020)', () => {
      expect(isInAnalysisPeriod('2020-07-15')).toBe(false);
    });

    it('returns false for a gap-year date (2023-2024)', () => {
      expect(isInAnalysisPeriod('2024-01-01')).toBe(false);
    });

    it('returns true for boundary dates', () => {
      expect(isInAnalysisPeriod('2017-01-20')).toBe(true); // first day of trump_2017
      expect(isInAnalysisPeriod('2018-01-19')).toBe(true); // last day of trump_2017
    });

    it('returns false just outside boundary', () => {
      expect(isInAnalysisPeriod('2017-01-19')).toBe(false); // day before trump_2017
      expect(isInAnalysisPeriod('2019-01-20')).toBe(false); // day after trump_2018
    });

    it('accepts Date objects', () => {
      expect(isInAnalysisPeriod(new Date('2022-06-15'))).toBe(true);
      expect(isInAnalysisPeriod(new Date('2020-07-15'))).toBe(false);
    });
  });

  describe('ACTIVE_SOURCES', () => {
    it('includes expected active sources', () => {
      expect(ACTIVE_SOURCES.has('federal_register')).toBe(true);
      expect(ACTIVE_SOURCES.has('courtlistener')).toBe(true);
      expect(ACTIVE_SOURCES.has('govinfo_cpd')).toBe(true);
      expect(ACTIVE_SOURCES.has('govinfo')).toBe(true);
      expect(ACTIVE_SOURCES.has('doj')).toBe(true);
      expect(ACTIVE_SOURCES.has('fec')).toBe(true);
      expect(ACTIVE_SOURCES.has('legiscan')).toBe(true);
    });

    it('excludes whitehouse and gdelt', () => {
      expect(ACTIVE_SOURCES.has('whitehouse')).toBe(false);
      expect(ACTIVE_SOURCES.has('gdelt')).toBe(false);
    });
  });
});
