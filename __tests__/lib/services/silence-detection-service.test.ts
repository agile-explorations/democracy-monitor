import { describe, it, expect } from 'vitest';
import {
  GOVERNMENT_SOURCES,
  INDEPENDENT_SOURCES,
  computeStats,
  addDays,
  getAdminInaugurationDate,
} from '@/lib/services/silence-detection-service';

describe('silence-detection-service', () => {
  describe('source classification', () => {
    it('classifies executive-branch sources as government', () => {
      expect(GOVERNMENT_SOURCES.has('federal_register')).toBe(true);
      expect(GOVERNMENT_SOURCES.has('doj')).toBe(true);
      expect(GOVERNMENT_SOURCES.has('govinfo_cpd')).toBe(true);
      expect(GOVERNMENT_SOURCES.has('oig')).toBe(true);
      expect(GOVERNMENT_SOURCES.has('fec')).toBe(true);
    });

    it('classifies legislative/judicial sources as independent', () => {
      expect(INDEPENDENT_SOURCES.has('courtlistener')).toBe(true);
      expect(INDEPENDENT_SOURCES.has('crec')).toBe(true);
      expect(INDEPENDENT_SOURCES.has('legiscan')).toBe(true);
    });

    it('classifies govinfo (GAO/CRPT/PLAW) as independent', () => {
      expect(INDEPENDENT_SOURCES.has('govinfo')).toBe(true);
      expect(GOVERNMENT_SOURCES.has('govinfo')).toBe(false);
    });

    it('classifies govinfo_cpd (Presidential Documents) as government', () => {
      expect(GOVERNMENT_SOURCES.has('govinfo_cpd')).toBe(true);
      expect(INDEPENDENT_SOURCES.has('govinfo_cpd')).toBe(false);
    });

    it('has no overlap between government and independent sets', () => {
      for (const s of GOVERNMENT_SOURCES) {
        expect(INDEPENDENT_SOURCES.has(s)).toBe(false);
      }
      for (const s of INDEPENDENT_SOURCES) {
        expect(GOVERNMENT_SOURCES.has(s)).toBe(false);
      }
    });
  });

  describe('computeStats', () => {
    it('returns zeros for empty array', () => {
      expect(computeStats([])).toEqual({ mean: 0, stdDev: 0 });
    });

    it('returns mean with zero stdDev for single value', () => {
      expect(computeStats([5])).toEqual({ mean: 5, stdDev: 0 });
    });

    it('computes mean and sample stdDev for multiple values', () => {
      const result = computeStats([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(result.mean).toBe(5);
      // Sample stdDev of [2,4,4,4,5,5,7,9] = sqrt(32/7) ≈ 2.1381
      expect(result.stdDev).toBeCloseTo(2.1381, 3);
    });

    it('returns zero stdDev for identical values', () => {
      expect(computeStats([3, 3, 3])).toEqual({ mean: 3, stdDev: 0 });
    });
  });

  describe('addDays', () => {
    it('adds positive days', () => {
      expect(addDays('2025-03-01', 7)).toBe('2025-03-08');
    });

    it('subtracts days with negative value', () => {
      expect(addDays('2025-03-10', -56)).toBe('2025-01-13');
    });

    it('handles month boundary', () => {
      expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    });

    it('handles year boundary', () => {
      expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    });
  });

  describe('getAdminInaugurationDate', () => {
    it('returns Trump T2 inauguration for dates after 2025-01-20', () => {
      expect(getAdminInaugurationDate('2025-02-10')).toBe('2025-01-20');
      expect(getAdminInaugurationDate('2026-03-21')).toBe('2025-01-20');
    });

    it('returns Trump T2 inauguration for inauguration day itself', () => {
      expect(getAdminInaugurationDate('2025-01-20')).toBe('2025-01-20');
    });

    it('returns Biden inauguration for dates in Biden admin', () => {
      expect(getAdminInaugurationDate('2022-06-15')).toBe('2021-01-20');
      expect(getAdminInaugurationDate('2025-01-19')).toBe('2021-01-20');
    });

    it('returns Trump T1 inauguration for dates in Trump T1 admin', () => {
      expect(getAdminInaugurationDate('2017-03-01')).toBe('2017-01-20');
      expect(getAdminInaugurationDate('2021-01-19')).toBe('2017-01-20');
    });

    it('falls back to earliest inauguration for very old dates', () => {
      expect(getAdminInaugurationDate('2016-01-01')).toBe('2017-01-20');
    });
  });
});
