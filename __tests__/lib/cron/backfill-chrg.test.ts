import { describe, expect, it, vi } from 'vitest';
import type { ContentItem } from '@/lib/types';

vi.mock('@/lib/db', () => ({
  isDbAvailable: () => false,
  getDb: () => {
    throw new Error('no db in tests');
  },
}));

vi.mock('@/lib/services/crec-classifier', () => ({
  classifyHearingToCategories: vi.fn((title: string) =>
    title.startsWith('Oversight') ? ['executiveOversight'] : [],
  ),
}));

const { routeHearingsToCategories, unroutedHearingItems } =
  await import('@/lib/cron/backfill-chrg');

describe('CHRG unrouted hearings (#892)', () => {
  const routed: ContentItem = { title: 'Oversight of DHS', content: 'text', link: 'https://h/1' };
  const noMatch: ContentItem = {
    title: 'Nominations hearing',
    content: 'text',
    link: 'https://h/2',
  };
  const noText: ContentItem = { title: 'Oversight of DOJ', link: 'https://h/3' };

  it('stores only zero-category hearings with text for search — no_text stays ledger-only', () => {
    const { routed: r, dropped } = routeHearingsToCategories([routed, noMatch, noText]);

    expect(r).toEqual([{ item: routed, categories: ['executiveOversight'] }]);
    expect(dropped.map((d) => d.reason)).toEqual(['zero_categories', 'no_text']);
    expect(unroutedHearingItems(dropped)).toEqual([noMatch]);
  });

  it('returns nothing when every drop lacks text', () => {
    expect(unroutedHearingItems([{ item: noText, reason: 'no_text' }])).toEqual([]);
  });
});
