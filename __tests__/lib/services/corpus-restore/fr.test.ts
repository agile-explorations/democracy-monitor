import { describe, expect, it, vi } from 'vitest';
import { assembleFrBatches, resolveDocNumbers } from '@/lib/services/corpus-restore/fr';
import type { ContentItem } from '@/lib/types';

vi.mock('@/lib/db', () => ({ getDb: vi.fn(), isDbAvailable: vi.fn(() => false) }));

const FR_URL = (num: string) =>
  `https://www.federalregister.gov/documents/2025/03/04/${num}/some-slug`;

describe('resolveDocNumbers', () => {
  it('derives distinct document numbers from ledger URLs and counts unparseable ones', () => {
    const rows = [
      { category: 'mediaFreedom', url: FR_URL('2025-01234') },
      { category: 'infoAvailability', url: FR_URL('2025-01234') },
      { category: 'mediaFreedom', url: FR_URL('2025-99999') },
      { category: 'mediaFreedom', url: 'https://www.federalregister.gov/not-a-document' },
    ];
    expect(resolveDocNumbers(rows)).toEqual({
      numbers: ['2025-01234', '2025-99999'],
      unresolvable: 1,
    });
  });
});

describe('assembleFrBatches', () => {
  it('groups candidates per ledger category with per-category matched counts', () => {
    const rows = [
      { category: 'mediaFreedom', url: FR_URL('2025-01234') },
      { category: 'infoAvailability', url: FR_URL('2025-01234') },
      { category: 'mediaFreedom', url: FR_URL('2025-55555') },
    ];
    const items = new Map<string, ContentItem>([
      ['2025-01234', { title: 'Doc A', link: FR_URL('2025-01234'), content: 'body' }],
    ]);
    const matched = new Map([
      ['mediaFreedom', 40],
      ['infoAvailability', 7],
    ]);
    const batches = assembleFrBatches(rows, matched, items, true);
    expect(batches).toHaveLength(2);
    const media = batches.find((b) => b.category === 'mediaFreedom')!;
    expect(media).toMatchObject({ matched: 40, netNew: 2, capTripped: true });
    expect(media.candidates.map((c) => c.title)).toEqual(['Doc A']);
    const info = batches.find((b) => b.category === 'infoAvailability')!;
    expect(info).toMatchObject({ matched: 7, netNew: 1 });
    expect(info.candidates).toHaveLength(1);
    expect(info.candidates[0]).not.toBe(media.candidates[0]);
  });
});
