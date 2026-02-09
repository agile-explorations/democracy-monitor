import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns empty array when GOVINFO_API_KEY is not set', async () => {
    vi.stubEnv('GOVINFO_API_KEY', '');

    const items = await fetchCongressionalRecord({
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
    });

    expect(items).toEqual([]);
  });

  it('fetches and filters packages by oversight search terms', async () => {
    vi.stubEnv('GOVINFO_API_KEY', 'test-api-key');

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/collections/CREC/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              packages: [
                {
                  packageId: 'CREC-2025-01-15',
                  title: 'Oversight hearing on inspector general independence',
                  dateIssued: '2025-01-15',
                },
                {
                  packageId: 'CREC-2025-01-16',
                  title: 'Discussion of weather patterns in the midwest',
                  dateIssued: '2025-01-16',
                },
                {
                  packageId: 'CREC-2025-02-01',
                  title: 'Executive order review session',
                  dateIssued: '2025-02-01',
                },
              ],
            }),
        });
      }
      if (url.includes('/packages/CREC-2025-01-15/summary')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              title: 'Oversight hearing on inspector general independence',
              download: { pdfLink: 'https://www.govinfo.gov/content/pkg/CREC-2025-01-15.pdf' },
              committees: [{ committeeName: 'Oversight Committee', chamber: 'house' }],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const items = await fetchCongressionalRecord({
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
      delayMs: 0,
    });

    // Should include the IG hearing (matches "inspector general")
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('CREC-2025-01-15');
    expect(items[0].title).toContain('inspector general');
    // Weather item filtered out (no matching term)
    // Feb item filtered out (outside date range)
  });

  it('returns empty array when GovInfo returns 500', async () => {
    vi.stubEnv('GOVINFO_API_KEY', 'test-api-key');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const items = await fetchCongressionalRecord({
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
    });

    expect(items).toEqual([]);
  });

  it('returns items with correct fields', async () => {
    vi.stubEnv('GOVINFO_API_KEY', 'test-api-key');

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/collections/CREC/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              packages: [
                {
                  packageId: 'CREC-2025-01-20',
                  title: 'Subpoena enforcement regarding executive privilege claims',
                  dateIssued: '2025-01-20',
                },
              ],
            }),
        });
      }
      if (url.includes('/packages/CREC-2025-01-20/summary')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              title: 'Subpoena enforcement details',
              download: { pdfLink: 'https://www.govinfo.gov/content/pkg/CREC-2025-01-20.pdf' },
              committees: [{ committeeName: 'Judiciary Committee', chamber: 'house' }],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const items = await fetchCongressionalRecord({
      dateFrom: '2025-01-01',
      dateTo: '2025-01-31',
      delayMs: 0,
    });

    expect(items.length).toBe(1);
    const item = items[0];
    expect(item.id).toBe('CREC-2025-01-20');
    expect(item.title).toContain('Subpoena');
    expect(item.date).toBe('2025-01-20');
    expect(item.url).toBe('https://www.govinfo.gov/content/pkg/CREC-2025-01-20.pdf');
    expect(item.chamber).toBeDefined();
    expect(item.committee).toBe('Judiciary Committee');
    expect(item.relevantCategories).toBeInstanceOf(Array);
    // Summary different from title, so should be set
    expect(item.summary).toBe('Subpoena enforcement details');
  });
});
