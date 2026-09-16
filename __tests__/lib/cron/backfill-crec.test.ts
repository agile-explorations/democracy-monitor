import { describe, expect, it, vi } from 'vitest';
import type { ContentItem } from '@/lib/types';

vi.mock('@/lib/db', () => ({
  isDbAvailable: () => false,
  getDb: () => {
    throw new Error('no db in tests');
  },
}));

vi.mock('@/lib/services/crec-classifier', () => ({
  classifyCrecToCategories: vi.fn((title: string) =>
    title.startsWith('Routine') ? [] : ['military', 'civilLiberties'],
  ),
}));

const { routeItemsToCategories } = await import('@/lib/cron/backfill-crec');

describe('routeItemsToCategories (#892)', () => {
  const speech: ContentItem = { title: 'National Guard deployment', link: 'https://crec/1' };
  const routine: ContentItem = { title: 'Routine morning business', link: 'https://crec/2' };

  it('splits classified granules from the unrouted ones instead of dropping them', () => {
    const { routed, unrouted } = routeItemsToCategories([speech, routine]);

    expect(routed).toEqual([{ item: speech, categories: ['military', 'civilLiberties'] }]);
    expect(unrouted).toEqual([routine]);
  });

  it('returns both lists empty for no input', () => {
    expect(routeItemsToCategories([])).toEqual({ routed: [], unrouted: [] });
  });

  it('classifies on an empty body when content is missing', () => {
    const { routed, unrouted } = routeItemsToCategories([{ title: 'Routine', link: 'x' }]);
    expect(routed).toHaveLength(0);
    expect(unrouted).toHaveLength(1);
  });
});
