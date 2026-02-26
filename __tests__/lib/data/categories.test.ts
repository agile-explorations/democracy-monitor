import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';

describe('CATEGORIES', () => {
  it('has 13 categories', () => {
    expect(CATEGORIES).toHaveLength(13);
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
    const validTypes = [
      'json',
      'rss',
      'html',
      'federal_register',
      'tracker_scrape',
      'courtlistener',
      'doj_json',
      'govinfo',
      'fec_json',
    ];
    for (const cat of CATEGORIES) {
      for (const signal of cat.signals) {
        expect(signal.name).toBeTruthy();
        expect(signal.url).toBeTruthy();
        expect(validTypes).toContain(signal.type);
      }
    }
  });

  it('has expected category keys', () => {
    const keys = CATEGORIES.map((c) => c.key);
    expect(keys).toContain('civilService');
    expect(keys).toContain('fiscal');
    expect(keys).toContain('executiveOversight');
    expect(keys).toContain('hatch');
    expect(keys).toContain('judicialIndependence');
    expect(keys).toContain('military');
    expect(keys).toContain('rulemaking');
    expect(keys).toContain('executiveActions');
    expect(keys).toContain('infoAvailability');
    expect(keys).toContain('elections');
    expect(keys).toContain('mediaFreedom');
    expect(keys).toContain('lawEnforcement');
    expect(keys).toContain('civilLiberties');
  });

  it('all category keys are unique', () => {
    const keys = CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('all signal IDs are unique across all categories', () => {
    const allIds = CATEGORIES.flatMap((c) => c.signals.map((s) => s.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('lawEnforcement has courtlistener and doj_json signal types', () => {
    const cat = CATEGORIES.find((c) => c.key === 'lawEnforcement');
    expect(cat).toBeDefined();
    const types = cat!.signals.map((s) => s.type);
    expect(types).toContain('courtlistener');
    expect(types).toContain('doj_json');
    expect(types).toContain('federal_register');
  });

  it('civilLiberties has courtlistener and doj_json signal types', () => {
    const cat = CATEGORIES.find((c) => c.key === 'civilLiberties');
    expect(cat).toBeDefined();
    const types = cat!.signals.map((s) => s.type);
    expect(types).toContain('courtlistener');
    expect(types).toContain('doj_json');
    expect(types).toContain('federal_register');
  });

  it('executiveOversight has govinfo and rss (IG) signal types', () => {
    const cat = CATEGORIES.find((c) => c.key === 'executiveOversight');
    expect(cat).toBeDefined();
    const types = cat!.signals.map((s) => s.type);
    expect(types).toContain('govinfo');
    expect(types).toContain('rss');
    const ids = cat!.signals.map((s) => s.id);
    expect(ids).toContain('gi_congressional_reports');
    expect(ids).toContain('rss_dod_oig');
    expect(ids).toContain('rss_hhs_oig');
    expect(ids).toContain('rss_doj_oig');
  });

  it('elections has fec_json signal type', () => {
    const cat = CATEGORIES.find((c) => c.key === 'elections');
    expect(cat).toBeDefined();
    const types = cat!.signals.map((s) => s.type);
    expect(types).toContain('fec_json');
    const ids = cat!.signals.map((s) => s.id);
    expect(ids).toContain('fec_advisory_opinions');
    expect(ids).toContain('fec_enforcement');
  });

  it('mediaFreedom has FCC RSS signals', () => {
    const cat = CATEGORIES.find((c) => c.key === 'mediaFreedom');
    expect(cat).toBeDefined();
    const ids = cat!.signals.map((s) => s.id);
    expect(ids).toContain('rss_fcc_media');
    expect(ids).toContain('rss_fcc_enforcement');
  });
});
