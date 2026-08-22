import { describe, it, expect } from 'vitest';
import { CATEGORIES, buildSignalLookup } from '@/lib/data/categories';

describe('CATEGORIES', () => {
  it('has 14 categories', () => {
    expect(CATEGORIES).toHaveLength(14);
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
      'federal_register',
      'courtlistener',
      'doj_json',
      'govinfo',
      'fec_json',
      'oig_html',
      'dhs_press',
      'gao_wayback',
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
    expect(keys).toContain('immigrationEnforcement');
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

  it('executiveOversight has govinfo and oig_html signal types', () => {
    const cat = CATEGORIES.find((c) => c.key === 'executiveOversight');
    expect(cat).toBeDefined();
    const types = cat!.signals.map((s) => s.type);
    expect(types).toContain('govinfo');
    expect(types).toContain('oig_html');
    const ids = cat!.signals.map((s) => s.id);
    expect(ids).toContain('gi_congressional_reports');
    expect(ids).toContain('oig_doj');
    expect(ids).toContain('oig_hhs');
    expect(ids).toContain('oig_ssa');
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

  it('immigrationEnforcement has federal_register signal types', () => {
    const cat = CATEGORIES.find((c) => c.key === 'immigrationEnforcement');
    expect(cat).toBeDefined();
    const types = cat!.signals.map((s) => s.type);
    expect(types).toContain('federal_register');
    const ids = cat!.signals.map((s) => s.id);
    expect(ids).toContain('fr_dhs_immigration');
    expect(ids).toContain('fr_cbp_enforcement');
  });

  it('mediaFreedom has federal_register signals', () => {
    const cat = CATEGORIES.find((c) => c.key === 'mediaFreedom');
    expect(cat).toBeDefined();
    const types = cat!.signals.map((s) => s.type);
    expect(types).toContain('federal_register');
  });
});

describe('buildSignalLookup', () => {
  it('returns all signal IDs from CATEGORIES', () => {
    const lookup = buildSignalLookup();
    const allIds = CATEGORIES.flatMap((c) => c.signals.map((s) => s.id));

    expect(lookup.size).toBe(allIds.length);

    for (const id of allIds) {
      expect(lookup.has(id)).toBe(true);
    }
  });

  it('maps each signal to correct category key', () => {
    const lookup = buildSignalLookup();

    for (const cat of CATEGORIES) {
      for (const signal of cat.signals) {
        const entry = lookup.get(signal.id);
        expect(entry).toBeDefined();
        expect(entry!.categoryKey).toBe(cat.key);
        expect(entry!.signal).toBe(signal);
      }
    }
  });

  it('has no duplicate signal IDs', () => {
    const lookup = buildSignalLookup();
    const allIds = CATEGORIES.flatMap((c) => c.signals.map((s) => s.id));

    // If there were duplicates, the map would be smaller
    expect(lookup.size).toBe(allIds.length);
  });
});
