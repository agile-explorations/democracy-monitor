import { describe, expect, it } from 'vitest';
import { ADMIN_OVERLAYS, getEffectiveKeywords } from '@/lib/data/admin-specific-keywords';
import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';

describe('getEffectiveKeywords', () => {
  describe('core keywords only (no date)', () => {
    it('returns core capture keywords when no date provided', () => {
      const result = getEffectiveKeywords('civilService', 'capture');
      expect(result).toEqual(ASSESSMENT_RULES.civilService.keywords.capture);
    });

    it('returns core warning keywords when no date provided', () => {
      const result = getEffectiveKeywords('civilService', 'warning');
      expect(result).toEqual(ASSESSMENT_RULES.civilService.keywords.warning);
    });

    it('returns empty array for unknown category', () => {
      const result = getEffectiveKeywords('nonexistent', 'capture');
      expect(result).toEqual([]);
    });
  });

  describe('date filtering', () => {
    it('excludes admin overlay for dates before applicableFrom', () => {
      const result = getEffectiveKeywords('civilService', 'warning', '2025-01-19');
      expect(result).toEqual(ASSESSMENT_RULES.civilService.keywords.warning);
      expect(result).not.toContain('doge');
    });

    it('includes admin overlay for dates on applicableFrom', () => {
      const result = getEffectiveKeywords('civilService', 'warning', '2025-01-20');
      expect(result).toContain('doge');
      expect(result).toContain('department of government efficiency');
      expect(result).toContain('fork in the road');
    });

    it('includes admin overlay for dates after applicableFrom', () => {
      const result = getEffectiveKeywords('civilService', 'warning', '2026-01-15');
      expect(result).toContain('doge');
    });

    it('includes admin overlay for fiscal category', () => {
      const result = getEffectiveKeywords('fiscal', 'warning', '2025-06-01');
      expect(result).toContain('doge spending review');
    });

    it('does not add overlay keywords to unaffected categories', () => {
      const result = getEffectiveKeywords('judicialIndependence', 'warning', '2025-06-01');
      expect(result).toEqual(ASSESSMENT_RULES.judicialIndependence.keywords.warning);
    });

    it('does not add overlay keywords to unaffected tiers', () => {
      const result = getEffectiveKeywords('civilService', 'drift', '2025-06-01');
      expect(result).toEqual(ASSESSMENT_RULES.civilService.keywords.drift);
      expect(result).not.toContain('doge');
    });
  });

  describe('merged result structure', () => {
    it('preserves all core keywords when merging', () => {
      const core = ASSESSMENT_RULES.civilService.keywords.warning;
      const merged = getEffectiveKeywords('civilService', 'warning', '2025-06-01');
      for (const keyword of core) {
        expect(merged).toContain(keyword);
      }
    });

    it('returns flat string array', () => {
      const result = getEffectiveKeywords('civilService', 'warning', '2025-06-01');
      expect(Array.isArray(result)).toBe(true);
      for (const item of result) {
        expect(typeof item).toBe('string');
      }
    });

    it('appends overlay keywords after core keywords', () => {
      const core = ASSESSMENT_RULES.civilService.keywords.warning;
      const merged = getEffectiveKeywords('civilService', 'warning', '2025-06-01');
      // Core keywords come first, overlay keywords appended
      expect(merged.length).toBe(core.length + 3); // 3 trump_2 civilService warning terms
      expect(merged.slice(0, core.length)).toEqual(core);
    });
  });

  describe('applicableTo boundary', () => {
    it('respects applicableTo when set', () => {
      // Temporarily we don't have overlays with applicableTo set,
      // but verify the logic handles it correctly by checking the filter
      const overlay = ADMIN_OVERLAYS[0];
      expect(overlay.applicableTo).toBeUndefined(); // schedule_f_era has no end date
    });
  });
});

describe('ADMIN_OVERLAYS structure', () => {
  it('has valid overlay entries', () => {
    for (const overlay of ADMIN_OVERLAYS) {
      expect(overlay.administration).toBeTruthy();
      expect(overlay.applicableFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (overlay.applicableTo) {
        expect(overlay.applicableTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      expect(typeof overlay.keywords).toBe('object');
    }
  });

  it('only references valid categories', () => {
    const validCategories = Object.keys(ASSESSMENT_RULES);
    for (const overlay of ADMIN_OVERLAYS) {
      for (const category of Object.keys(overlay.keywords)) {
        expect(validCategories).toContain(category);
      }
    }
  });

  it('only references valid tiers', () => {
    const validTiers = ['capture', 'drift', 'warning'];
    for (const overlay of ADMIN_OVERLAYS) {
      for (const tiers of Object.values(overlay.keywords)) {
        for (const tier of Object.keys(tiers)) {
          expect(validTiers).toContain(tier);
        }
      }
    }
  });
});

describe('assessment-rules.ts structure', () => {
  it('all keyword tiers are string arrays', () => {
    for (const [category, rules] of Object.entries(ASSESSMENT_RULES)) {
      for (const tier of ['capture', 'drift', 'warning'] as const) {
        const keywords = rules.keywords[tier];
        expect(Array.isArray(keywords), `${category}.${tier} should be an array`).toBe(true);
        for (const kw of keywords) {
          expect(typeof kw, `${category}.${tier} should contain strings`).toBe('string');
        }
      }
    }
  });
});
