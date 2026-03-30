import { describe, expect, it } from 'vitest';
import {
  classifyLegislativeRelevance,
  OVERSIGHT_SEARCH_TERMS,
} from '@/lib/services/legislative-fetcher';

describe('classifyLegislativeRelevance', () => {
  it('matches courts-related text', () => {
    const categories = classifyLegislativeRelevance(
      'Hearing on contempt of court regarding executive order compliance',
    );
    expect(categories).toContain('judicialIndependence');
  });

  it('matches igs-related text', () => {
    const categories = classifyLegislativeRelevance(
      'Inspector general removed from oversight position',
    );
    expect(categories).toContain('executiveOversight');
  });

  it('matches fiscal-related text', () => {
    const categories = classifyLegislativeRelevance('Impoundment of appropriated funds');
    expect(categories).toContain('fiscal');
  });

  it('matches civil service text', () => {
    const categories = classifyLegislativeRelevance(
      'Schedule F civil service reclassification hearing',
    );
    expect(categories).toContain('civilService');
  });

  it('returns empty array for unrelated text', () => {
    const categories = classifyLegislativeRelevance('Weather forecast for Tuesday');
    expect(categories).toEqual([]);
  });

  it('matches multiple categories from combined text', () => {
    const categories = classifyLegislativeRelevance(
      'Inspector general fired amid contempt of court finding against executive branch',
    );
    expect(categories).toContain('executiveOversight');
    expect(categories).toContain('judicialIndependence');
  });

  it('uses summary text for additional matching', () => {
    const categories = classifyLegislativeRelevance(
      'Oversight hearing',
      'Discussion of schedule f and merit system violations',
    );
    expect(categories).toContain('civilService');
  });

  it('does not match generic health education bill', () => {
    const categories = classifyLegislativeRelevance('AN ACT relating to health education');
    expect(categories).toEqual([]);
  });

  it('does not match National Puppy Day resolution', () => {
    const categories = classifyLegislativeRelevance(
      'National Puppy Day Resolution',
      'Designating March 23 as National Puppy Day',
    );
    expect(categories).toEqual([]);
  });

  it('matches law enforcement bill with "law enforcement" in title', () => {
    const categories = classifyLegislativeRelevance(
      'Fleeing or Attempting to Elude a Law Enforcement Officer',
    );
    expect(categories).toContain('lawEnforcement');
  });
});

describe('OVERSIGHT_SEARCH_TERMS', () => {
  it('contains key oversight terms', () => {
    expect(OVERSIGHT_SEARCH_TERMS).toContain('inspector general');
    expect(OVERSIGHT_SEARCH_TERMS).toContain('executive order');
    expect(OVERSIGHT_SEARCH_TERMS).toContain('subpoena');
    expect(OVERSIGHT_SEARCH_TERMS).toContain('oversight hearing');
  });
});
