import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';

describe('CATEGORIES', () => {
  it('has 11 categories', () => {
    expect(CATEGORIES).toHaveLength(11);
  });

  it('each category has required fields', () => {
    for (const cat of CATEGORIES) {
      expect(cat.key).toBeTruthy();
      expect(cat.title).toBeTruthy();
      expect(cat.description).toBeTruthy();
      expect(cat.signals).toBeDefined();
      expect(cat.signals.length).toBeGreaterThan(0);
    }
  });

  it('each signal has required fields', () => {
    for (const cat of CATEGORIES) {
      for (const signal of cat.signals) {
        expect(signal.name).toBeTruthy();
        expect(signal.url).toBeTruthy();
        expect(['json', 'rss', 'html', 'federal_register', 'tracker_scrape']).toContain(
          signal.type,
        );
      }
    }
  });

  it('has expected category keys', () => {
    const keys = CATEGORIES.map((c) => c.key);
    expect(keys).toContain('civilService');
    expect(keys).toContain('fiscal');
    expect(keys).toContain('igs');
    expect(keys).toContain('hatch');
    expect(keys).toContain('courts');
    expect(keys).toContain('military');
    expect(keys).toContain('rulemaking');
    expect(keys).toContain('indices');
    expect(keys).toContain('infoAvailability');
    expect(keys).toContain('elections');
    expect(keys).toContain('mediaFreedom');
  });

  it('all category keys are unique', () => {
    const keys = CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
