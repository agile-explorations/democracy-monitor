import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';
import { CATEGORY_MATURITY } from '@/lib/data/category-maturity';

describe('CATEGORY_MATURITY', () => {
  it('has an entry for every category in CATEGORIES', () => {
    for (const cat of CATEGORIES) {
      expect(
        CATEGORY_MATURITY[cat.key],
        `Missing maturity entry for category "${cat.key}"`,
      ).toBeDefined();
    }
  });

  it('only contains valid maturity levels', () => {
    const validLevels = ['Experimental', 'Calibrating', 'Validated'];
    for (const [key, level] of Object.entries(CATEGORY_MATURITY)) {
      expect(validLevels, `Invalid maturity level "${level}" for "${key}"`).toContain(level);
    }
  });
});
