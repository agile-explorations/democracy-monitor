import { describe, expect, it, vi } from 'vitest';
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';
import { buildFilterConditions } from '@/lib/services/search-queries';

vi.mock('@/lib/db', () => ({ getDb: () => ({}), isDbAvailable: () => false }));

/** Render a drizzle SQL chunk to its parameter-inlined text for assertions
 *  (same helper as __tests__/lib/db/document-filters.test.ts). */
function text(chunk: unknown): string {
  const render = (c: unknown): string => {
    if (typeof c === 'string') return c;
    const anyC = c as { queryChunks?: unknown[]; value?: unknown; name?: string };
    if (Array.isArray(anyC.queryChunks)) return anyC.queryChunks.map(render).join('');
    if (Array.isArray(anyC.value)) return anyC.value.join('');
    if (anyC.value !== undefined) return String(anyC.value);
    if (anyC.name) return anyC.name;
    return '';
  };
  return render(chunk).replace(/\s+/g, ' ').trim();
}

const ROUTED_ONLY = `d.retrieval_relevant IS NOT FALSE AND d.category <> ${CORPUS_CATEGORY}`;

const rendered = (filters: Parameters<typeof buildFilterConditions>[0]) =>
  buildFilterConditions(filters).map(text).join(' AND ');

describe('buildFilterConditions — Explore routed-only default (#895)', () => {
  it('defaults to routed documents when includeUnrouted is absent', () => {
    const where = rendered({ query: 'schedule f' });
    expect(where).toContain(ROUTED_ONLY);
    expect(where).toContain('d.superseded IS NOT TRUE');
  });

  it('defaults to routed documents when includeUnrouted is false', () => {
    expect(rendered({ query: 'schedule f', includeUnrouted: false })).toContain(ROUTED_ONLY);
  });

  it('drops the routed-only clause when includeUnrouted is true', () => {
    const where = rendered({ query: 'schedule f', includeUnrouted: true });
    expect(where).not.toContain('retrieval_relevant');
    expect(where).not.toContain(`d.category <> ${CORPUS_CATEGORY}`);
    // The searchable population is still enforced.
    expect(where).toContain("d.content_type != 'metadata_only'");
  });

  it('the "Not routed to a category" facet implies the toggle', () => {
    const where = rendered({ query: 'schedule f', category: CORPUS_CATEGORY });
    expect(where).toContain(`(d.category = ${CORPUS_CATEGORY} OR d.retrieval_relevant IS FALSE)`);
    expect(where).not.toContain(ROUTED_ONLY);
  });

  it('a routed category facet keeps the routed-only default', () => {
    const where = rendered({ query: 'schedule f', category: 'mediaFreedom' });
    expect(where).toContain('(d.category = mediaFreedom AND d.retrieval_relevant IS NOT FALSE)');
    expect(where).toContain(ROUTED_ONLY);
  });
});
