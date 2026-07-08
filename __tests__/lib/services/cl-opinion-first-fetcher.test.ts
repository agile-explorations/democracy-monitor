import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiOpinionFirstPass,
  buildOpinionSearchUrl,
  CIRCUIT_COURT_IDS,
  COURT_QUERIES,
  EXEC_POWER_QUERY,
  FIRST_AMENDMENT_QUERY,
} from '@/lib/services/cl-opinion-first-fetcher';
import type { ContentItem } from '@/lib/types';

// Capture what the pass stores, so tests assert on real output rather than mock internals.
const { storedDocs } = vi.hoisted(() => ({
  storedDocs: [] as Array<{ items: ContentItem[]; category: string }>,
}));

// sleep → instant so the 2s rate-limit delays don't slow tests
vi.mock('@/lib/utils/async', () => ({ sleep: vi.fn().mockResolvedValue(undefined) }));
// avoid loading the pg-backed staging module; force the API path in the dispatcher
vi.mock('@/lib/services/cl-bulk-staging', () => ({
  isBulkOpinionDbAvailable: vi.fn().mockResolvedValue(false),
  backfillOpinionsByDate: vi.fn(),
}));
vi.mock('@/lib/services/document-store', () => ({
  storeDocuments: vi.fn(async (items: ContentItem[], category: string) => {
    storedDocs.push({ items, category });
    return items.length;
  }),
}));

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

/** One opinion cluster row as returned by the CL v4 type=o search. */
function cluster(overrides: Record<string, unknown> = {}) {
  return {
    cluster_id: 1,
    docket_id: 100,
    caseName: 'Doe v. State',
    court: 'D. Test',
    court_jurisdiction: 'FD',
    suitNature: '',
    dateFiled: '2026-06-24',
    opinions: [{ id: 5001 }],
    ...overrides,
  };
}

/**
 * Build a fetch mock: every /search/ call returns `results` (single page),
 * every /opinions/ call returns a substantive opinion.
 */
function mockFetch(results: unknown[]): void {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/search/')) return jsonResponse({ next: null, results });
    if (url.includes('/opinions/')) {
      return jsonResponse({
        id: 5001,
        type: '020lead',
        plain_text: 'Substantive opinion text.',
        absolute_url: '/opinion/1/doe-v-state/',
      });
    }
    return jsonResponse({}, false, 404);
  }) as unknown as typeof fetch;
}

describe('buildOpinionSearchUrl', () => {
  it('builds a NOS query with type=o and date range', () => {
    const url = buildOpinionSearchUrl({ nos: '440', dateFrom: '2026-06-22', dateTo: '2026-06-28' });
    expect(url).toContain('type=o');
    expect(url).toContain('nature_of_suit=440');
    expect(url).toContain('filed_after=2026-06-22');
    expect(url).toContain('filed_before=2026-06-28');
    expect(url).not.toContain('q=');
  });

  it('builds a free-text query without a NOS filter', () => {
    const url = buildOpinionSearchUrl({
      query: FIRST_AMENDMENT_QUERY,
      dateFrom: '2026-06-22',
      dateTo: '2026-06-28',
    });
    expect(url).toContain('type=o');
    expect(url).toContain('q=');
    expect(url).not.toContain('nature_of_suit');
  });
});

describe('FIRST_AMENDMENT_QUERY', () => {
  it('matches the categories.ts first-amendment signal', () => {
    expect(FIRST_AMENDMENT_QUERY).toContain('"first amendment"');
    for (const q of [
      'violation',
      'injunction',
      'challenge',
      'retaliation',
      'free speech',
      'free press',
    ]) {
      expect(FIRST_AMENDMENT_QUERY).toContain(q);
    }
  });
});

describe('apiOpinionFirstPass', () => {
  beforeEach(() => {
    storedDocs.length = 0;
  });

  it('dedups a cluster across queries and stores the opinion in each routed category', async () => {
    // Same cluster matches all four queries → deduped to one; routes to
    // lawEnforcement + civilLiberties (NOS 440/530/890 ∪ first-amendment).
    mockFetch([cluster()]);

    const result = await apiOpinionFirstPass('2026-06-22', '2026-06-28', false);

    expect(result.docketsFound).toBe(1);
    expect(result.opinionsStored).toBe(2);
    expect(storedDocs.map((d) => d.category).sort()).toEqual(['civilLiberties', 'lawEnforcement']);
    // Opinion stored as judicial_opinion with the canonical CL opinion URL
    // (byte-identical to the docket-first path → upsert-safe, no duplicates).
    expect(storedDocs[0].items[0].type).toBe('judicial_opinion');
    expect(storedDocs[0].items[0].link).toBe(
      'https://www.courtlistener.com/opinion/1/doe-v-state/',
    );
  });

  it('dry run reports matches without writing documents', async () => {
    mockFetch([cluster()]);

    const result = await apiOpinionFirstPass('2026-06-22', '2026-06-28', true);

    expect(result.docketsFound).toBe(1);
    expect(result.opinionsStored).toBe(2);
    expect(storedDocs).toHaveLength(0);
  });

  it('filters out non-federal (state) opinions', async () => {
    mockFetch([cluster({ court_jurisdiction: 'S' })]);

    const result = await apiOpinionFirstPass('2026-06-22', '2026-06-28', false);

    expect(result.docketsFound).toBe(0);
    expect(storedDocs).toHaveLength(0);
  });
});

describe('court-scoped queries (#528)', () => {
  beforeEach(() => {
    storedDocs.length = 0;
  });

  it('buildOpinionSearchUrl includes the court filter', () => {
    const url = buildOpinionSearchUrl({
      court: 'scotus',
      query: EXEC_POWER_QUERY,
      dateFrom: '2026-06-22',
      dateTo: '2026-06-28',
    });
    expect(url).toContain('court=scotus');
    expect(url).toContain('q=');
    expect(url).not.toContain('nature_of_suit');
  });

  it('COURT_QUERIES covers SCOTUS-all, circuits+exec, and dcd+exec', () => {
    expect(COURT_QUERIES.map((q) => q.key)).toEqual(['scotus-all', 'circuits-exec', 'dcd-exec']);
    expect(COURT_QUERIES[0].query).toBeUndefined(); // SCOTUS ingests everything
    expect(CIRCUIT_COURT_IDS.split(' ')).toHaveLength(13);
  });

  /**
   * Mock where only court-scoped searches return the cluster (NOS/1A return
   * nothing) — isolates the content-routed branch.
   */
  function mockCourtOnlyFetch(row: unknown, opinionText: string): void {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/search/')) {
        return jsonResponse({ next: null, results: url.includes('court=') ? [row] : [] });
      }
      if (url.includes('/opinions/')) {
        return jsonResponse({
          id: 5001,
          type: '020lead',
          plain_text: opinionText,
          absolute_url: '/opinion/1/case/',
        });
      }
      return jsonResponse({}, false, 404);
    }) as unknown as typeof fetch;
  }

  it('routes a court-query cluster by content and tags clQueries provenance', async () => {
    mockCourtOnlyFetch(
      cluster({ caseName: 'Trump v. J. G. G.', court: 'Supreme Court', court_jurisdiction: 'F' }),
      'The government invoked the Alien Enemies Act to summarily remove designated nationals.',
    );

    const result = await apiOpinionFirstPass('2026-06-22', '2026-06-28', false);

    expect(result.opinionsStored).toBeGreaterThanOrEqual(1);
    const categories = storedDocs.map((d) => d.category);
    expect(categories).toContain('immigrationEnforcement');
    const meta = storedDocs[0].items[0].metadata as { clQueries?: string[] };
    expect(meta.clQueries).toEqual(
      expect.arrayContaining(['scotus-all', 'circuits-exec', 'dcd-exec']),
    );
  });

  it('does not store an unroutable court-query cluster (classifier gate)', async () => {
    mockCourtOnlyFetch(
      cluster({ caseName: 'Smith v. Acme Pension Plan', court_jurisdiction: 'F' }),
      'The plan administrator denied benefits. Summary judgment is granted for defendant.',
    );

    const result = await apiOpinionFirstPass('2026-06-22', '2026-06-28', false);

    expect(result.docketsFound).toBe(1); // text was fetched...
    expect(result.opinionsStored).toBe(0); // ...but nothing stored
    expect(storedDocs).toHaveLength(0);
  });

  it('unions NOS routing with content routing when both query families match', async () => {
    // All searches (NOS + court) return the cluster; text mentions Alien Enemies Act.
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/search/')) return jsonResponse({ next: null, results: [cluster()] });
      if (url.includes('/opinions/')) {
        return jsonResponse({
          id: 5001,
          type: '020lead',
          plain_text: 'Habeas petition under the Alien Enemies Act.',
          absolute_url: '/opinion/1/doe-v-state/',
        });
      }
      return jsonResponse({}, false, 404);
    }) as unknown as typeof fetch;

    await apiOpinionFirstPass('2026-06-22', '2026-06-28', false);

    const categories = storedDocs.map((d) => d.category).sort();
    // NOS 440/530/890 → civilLiberties+lawEnforcement; content → immigrationEnforcement
    expect(categories).toEqual(['civilLiberties', 'immigrationEnforcement', 'lawEnforcement']);
    // One store call per category — the (url, category) upsert dedups any rerun.
    const urls = new Set(storedDocs.map((d) => d.items[0].link));
    expect(urls.size).toBe(1);
  });
});
