import { describe, it, expect } from 'vitest';
import { POLICY_AREA_CATEGORIES, mapPolicyAreaToCategories } from '@/lib/data/category-topics';

describe('POLICY_AREA_CATEGORIES', () => {
  it('maps all 5 policy areas', () => {
    const areas = Object.keys(POLICY_AREA_CATEGORIES);
    expect(areas).toHaveLength(5);
    expect(areas).toContain('rule_of_law');
    expect(areas).toContain('civil_liberties');
    expect(areas).toContain('elections');
    expect(areas).toContain('media_freedom');
    expect(areas).toContain('institutional_independence');
  });

  it('maps igs to both rule_of_law and institutional_independence', () => {
    expect(POLICY_AREA_CATEGORIES.rule_of_law).toContain('igs');
    expect(POLICY_AREA_CATEGORIES.institutional_independence).toContain('igs');
  });

  it('maps courts to both rule_of_law and civil_liberties', () => {
    expect(POLICY_AREA_CATEGORIES.rule_of_law).toContain('courts');
    expect(POLICY_AREA_CATEGORIES.civil_liberties).toContain('courts');
  });

  it('maps executiveActions to both civil_liberties and institutional_independence', () => {
    expect(POLICY_AREA_CATEGORIES.civil_liberties).toContain('executiveActions');
    expect(POLICY_AREA_CATEGORIES.institutional_independence).toContain('executiveActions');
  });

  it('does not map civilService, fiscal, military, hatch, or infoAvailability', () => {
    const allMapped = Object.values(POLICY_AREA_CATEGORIES).flat();
    expect(allMapped).not.toContain('civilService');
    expect(allMapped).not.toContain('fiscal');
    expect(allMapped).not.toContain('military');
    expect(allMapped).not.toContain('hatch');
    expect(allMapped).not.toContain('infoAvailability');
  });
});

describe('mapPolicyAreaToCategories', () => {
  it('maps policy area texts to assessment categories', () => {
    const textsByPolicyArea = new Map([
      ['rule_of_law', ['Court ruling on oversight', 'IG investigation blocked']],
      ['elections', ['Ballot access restricted']],
    ]);

    const result = mapPolicyAreaToCategories(textsByPolicyArea);

    expect(result.get('courts')).toEqual(['Court ruling on oversight', 'IG investigation blocked']);
    expect(result.get('igs')).toEqual(['Court ruling on oversight', 'IG investigation blocked']);
    expect(result.get('elections')).toEqual(['Ballot access restricted']);
  });

  it('merges texts when a category maps from multiple policy areas', () => {
    const textsByPolicyArea = new Map([
      ['rule_of_law', ['Court order defied']],
      ['civil_liberties', ['Detention without charge']],
    ]);

    const result = mapPolicyAreaToCategories(textsByPolicyArea);

    // courts maps from both rule_of_law and civil_liberties
    expect(result.get('courts')).toEqual(['Court order defied', 'Detention without charge']);
  });

  it('returns empty map for empty input', () => {
    const result = mapPolicyAreaToCategories(new Map());
    expect(result.size).toBe(0);
  });

  it('ignores unknown policy areas', () => {
    const textsByPolicyArea = new Map([['unknown_area', ['Some text']]]);
    const result = mapPolicyAreaToCategories(textsByPolicyArea);
    expect(result.size).toBe(0);
  });
});
