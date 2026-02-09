import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  classifyLegislativeRelevance,
  fetchCongressionalRecord,
  OVERSIGHT_SEARCH_TERMS,
} from '@/lib/services/legislative-fetcher';

describe('classifyLegislativeRelevance', () => {
  it('matches courts-related text', () => {
    const categories = classifyLegislativeRelevance(
      'Hearing on contempt of court regarding executive order compliance',
    );
    expect(categories).toContain('courts');
  });

  it('matches igs-related text', () => {
    const categories = classifyLegislativeRelevance(
      'Inspector general removed from oversight position',
    );
    expect(categories).toContain('igs');
  });

  it('matches fiscal-related text', () => {
    const categories = classifyLegislativeRelevance('Impoundment of appropriated funds');
    expect(categories).toContain('fiscal');
  });

  it('matches civil service text', () => {
    const categories = classifyLegislativeRelevance('Schedule F reclassification hearing');
    expect(categories).toContain('civilService');
  });

  it('returns empty array for unrelated text', () => {
    const categories = classifyLegislativeRelevance('Weather forecast for Tuesday');
    expect(categories).toEqual([]);
  });

  it('matches multiple categories from combined text', () => {
    const categories = classifyLegislativeRelevance(
      'IG fired amid contempt of court finding against executive branch',
    );
    expect(categories).toContain('igs');
    expect(categories).toContain('courts');
  });

  it('uses summary text for additional matching', () => {
    const categories = classifyLegislativeRelevance(
      'Oversight hearing',
      'Discussion of schedule f and merit system violations',
    );
    expect(categories).toContain('civilService');
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

describe('fetchCongressionalRecord', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns empty array when GOVINFO_API_KEY is not set', async () => {
    vi.stubEnv('GOVINFO_API_KEY', '');

    const items = await fetchCongressionalRecord({
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
    });

    expect(items).toEqual([]);
  });
});
