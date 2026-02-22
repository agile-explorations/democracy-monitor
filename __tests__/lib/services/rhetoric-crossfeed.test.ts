import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';
import {
  extractCategoryCrossfeedTerms,
  classifyRhetoricToCategories,
} from '@/lib/services/rhetoric-crossfeed';

describe('extractCategoryCrossfeedTerms', () => {
  it('returns entries for all categories with FR signals', () => {
    const terms = extractCategoryCrossfeedTerms();
    expect(terms.length).toBeGreaterThan(0);

    // Every entry should have a valid category key
    const categoryKeys = CATEGORIES.map((c) => c.key);
    for (const entry of terms) {
      expect(categoryKeys).toContain(entry.category);
      expect(entry.terms.length).toBeGreaterThan(0);
    }
  });

  it('strips quotes from phrase terms', () => {
    const terms = extractCategoryCrossfeedTerms();
    for (const entry of terms) {
      for (const term of entry.terms) {
        expect(term).not.toContain('"');
      }
    }
  });

  it('lowercases all terms', () => {
    const terms = extractCategoryCrossfeedTerms();
    for (const entry of terms) {
      for (const term of entry.terms) {
        expect(term).toBe(term.toLowerCase());
      }
    }
  });

  it('extracts known signal terms for civilService', () => {
    const terms = extractCategoryCrossfeedTerms();
    const civilService = terms.find((t) => t.category === 'civilService');
    expect(civilService).toBeDefined();
    expect(civilService!.terms).toContain('schedule f');
    expect(civilService!.terms).toContain('workforce');
  });

  it('extracts known signal terms for fiscal', () => {
    const terms = extractCategoryCrossfeedTerms();
    const fiscal = terms.find((t) => t.category === 'fiscal');
    expect(fiscal).toBeDefined();
    expect(fiscal!.terms).toContain('impoundment');
    expect(fiscal!.terms).toContain('rescission');
  });
});

describe('classifyRhetoricToCategories', () => {
  it('routes workforce rhetoric to civilService', () => {
    const cats = classifyRhetoricToCategories('Federal workforce reduction announced by OPM');
    expect(cats).toContain('civilService');
  });

  it('routes impoundment rhetoric to fiscal', () => {
    const cats = classifyRhetoricToCategories(
      'President announces impoundment of congressional appropriations',
    );
    expect(cats).toContain('fiscal');
  });

  it('routes inspector general rhetoric to igs', () => {
    const cats = classifyRhetoricToCategories('Inspector General fired amid ongoing investigation');
    expect(cats).toContain('igs');
  });

  it('routes court rhetoric to courts', () => {
    const cats = classifyRhetoricToCategories(
      'Administration defies court injunction compliance order',
    );
    expect(cats).toContain('courts');
  });

  it('routes military rhetoric to military', () => {
    const cats = classifyRhetoricToCategories('National emergency declared for border deployment');
    expect(cats).toContain('military');
  });

  it('routes election rhetoric to elections', () => {
    const cats = classifyRhetoricToCategories(
      'New election integrity measures restrict ballot access',
    );
    expect(cats).toContain('elections');
  });

  it('routes press freedom rhetoric to mediaFreedom', () => {
    const cats = classifyRhetoricToCategories('Press credentials revoked for critical journalists');
    expect(cats).toContain('mediaFreedom');
  });

  it('routes transparency rhetoric to infoAvailability', () => {
    const cats = classifyRhetoricToCategories('FOIA compliance rates plummet across agencies');
    expect(cats).toContain('infoAvailability');
  });

  it('routes executive action rhetoric to executiveActions', () => {
    const cats = classifyRhetoricToCategories(
      'President signs flurry of executive orders on first day',
    );
    expect(cats).toContain('executiveActions');
  });

  it('all 11 categories are reachable', () => {
    const allTerms = extractCategoryCrossfeedTerms();
    const covered = new Set(allTerms.map((t) => t.category));
    const expected = CATEGORIES.map((c) => c.key);
    for (const key of expected) {
      expect(covered).toContain(key);
    }
  });

  it('routes a document to multiple categories when terms overlap', () => {
    const cats = classifyRhetoricToCategories(
      'Executive order impoundment oversight inspector general review',
    );
    expect(cats.length).toBeGreaterThan(1);
  });

  it('returns empty array for unrelated content', () => {
    const cats = classifyRhetoricToCategories('Local sports team wins championship game');
    expect(cats).toHaveLength(0);
  });

  it('matches against summary text as well as title', () => {
    const cats = classifyRhetoricToCategories(
      'White House statement on government policy',
      'The reduction in force will affect thousands of federal employees',
    );
    expect(cats).toContain('civilService');
  });
});
