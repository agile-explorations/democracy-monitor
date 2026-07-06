import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiOpinionFirstPass,
  buildOpinionSearchUrl,
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
