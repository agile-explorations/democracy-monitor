import { describe, it, expect } from 'vitest';
import {
  CPD_SUBJECT_TO_CATEGORIES,
  CPD_UNMAPPED_SUBJECTS_EXPECTED,
  mapSubjectsToCategories,
} from '@/lib/data/cpd-subject-map';

const VALID_CATEGORIES = [
  'executiveActions',
  'executiveOversight',
  'civilService',
  'judicialIndependence',
  'lawEnforcement',
  'civilLiberties',
  'elections',
  'immigrationEnforcement',
  'fiscal',
  'military',
  'emergencyPowers',
  'rulemaking',
  'infoAvailability',
  'mediaFreedom',
];

describe('CPD_SUBJECT_TO_CATEGORIES', () => {
  it('maps all subjects to valid category keys', () => {
    for (const [subject, categories] of CPD_SUBJECT_TO_CATEGORIES) {
      for (const cat of categories) {
        expect(VALID_CATEGORIES, `"${subject}" maps to invalid category "${cat}"`).toContain(cat);
      }
    }
  });

  it('has no overlap with expected-unmapped set', () => {
    for (const subject of CPD_UNMAPPED_SUBJECTS_EXPECTED) {
      expect(
        CPD_SUBJECT_TO_CATEGORIES.has(subject),
        `"${subject}" is both mapped and expected-unmapped`,
      ).toBe(false);
    }
  });

  it('maps every category to at least one subject', () => {
    const coveredCategories = new Set<string>();
    for (const [, categories] of CPD_SUBJECT_TO_CATEGORIES) {
      for (const cat of categories) coveredCategories.add(cat);
    }
    for (const cat of VALID_CATEGORIES) {
      expect(coveredCategories, `No subject maps to "${cat}"`).toContain(cat);
    }
  });
});

describe('mapSubjectsToCategories', () => {
  it('returns deduplicated categories for mapped subjects', () => {
    const categories = mapSubjectsToCategories(['Presidency, U.S', 'Legislation, enacted']);
    expect(categories).toEqual(['executiveActions']);
  });

  it('returns union of categories for multi-category subjects', () => {
    const categories = mapSubjectsToCategories([
      'Department of Justice Inspector General',
      'Federal Bureau of Investigation',
    ]);
    expect(categories).toContain('executiveOversight');
    expect(categories).toContain('lawEnforcement');
  });

  it('returns empty array for unmapped subjects', () => {
    const categories = mapSubjectsToCategories(['Holidays and special observances', 'Sports']);
    expect(categories).toEqual([]);
  });

  it('collects unexpected unmapped subjects', () => {
    const unmapped = new Set<string>();
    mapSubjectsToCategories(['Completely Unknown Subject XYZ'], unmapped);
    expect(unmapped).toContain('Completely Unknown Subject XYZ');
  });

  it('does not collect expected-unmapped subjects', () => {
    const unmapped = new Set<string>();
    mapSubjectsToCategories(['Congress', 'Deaths', 'Mexico'], unmapped);
    expect(unmapped.size).toBe(0);
  });

  it('routes IG firings document subjects to executiveOversight', () => {
    // Subjects from DCPD-202500184 (Jan 25, 2025 — IG firings known event)
    const subjects = [
      'Department of Justice Inspector General',
      'Federal Bureau of Investigation',
      'Secretary of Homeland Security',
      'Senate confirmation process',
      'News media, Presidential interviews',
    ];
    const categories = mapSubjectsToCategories(subjects);
    expect(categories).toContain('executiveOversight');
    expect(categories).toContain('lawEnforcement');
    expect(categories).toContain('emergencyPowers');
    expect(categories).toContain('judicialIndependence');
  });

  it('handles NARA typo variants', () => {
    // Double-space typo in NARA data
    const cats1 = mapSubjectsToCategories([
      'Federal  agencies and employees, return to in-person work',
    ]);
    expect(cats1).toContain('civilService');

    // Double-space in "Defense and national  security"
    const cats2 = mapSubjectsToCategories(['Defense and national  security']);
    expect(cats2).toContain('military');

    // Period instead of comma in "Navy. Department of the"
    const cats3 = mapSubjectsToCategories(['Navy. Department of the']);
    expect(cats3).toContain('military');
  });
});
