import { describe, expect, it } from 'vitest';
import { pickSuperseded } from '@/lib/services/opinion-revision-dedup';

const row = (id: number, url: string, fetchedAt: string | null, countingScope = true) => ({
  id,
  url,
  fetchedAt,
  countingScope,
});

describe('pickSuperseded (#741)', () => {
  it('keeps the row just stored when its url is given', () => {
    const rows = [
      row(1, 'https://cl/opinion/10764200/trump-v-illinois/', '2025-12-24T00:00:00Z'),
      row(2, 'https://cl/opinion/10766642/trump-v-illinois/', '2025-12-25T00:00:00Z'),
    ];
    const { keeper, superseded } = pickSuperseded(rows, rows[0].url);
    expect(keeper?.id).toBe(1);
    expect(superseded.map((r) => r.id)).toEqual([2]);
  });

  it('keeps the latest-fetched row otherwise, ties broken by highest id', () => {
    const rows = [
      row(1, 'a', '2025-06-27T00:00:00Z'),
      row(2, 'b', '2025-06-28T00:00:00Z'),
      row(3, 'c', '2025-06-28T00:00:00Z'),
    ];
    const { keeper, superseded } = pickSuperseded(rows);
    expect(keeper?.id).toBe(3);
    expect(superseded.map((r) => r.id)).toEqual([1, 2]);
  });

  it('marks nothing for a single row', () => {
    const { keeper, superseded } = pickSuperseded([row(1, 'a', null)]);
    expect(keeper?.id).toBe(1);
    expect(superseded).toEqual([]);
  });

  it('falls back to latest-fetched when the given url is not among the rows', () => {
    const rows = [row(1, 'a', '2025-06-27T00:00:00Z'), row(2, 'b', '2025-06-28T00:00:00Z')];
    expect(pickSuperseded(rows, 'zzz').keeper?.id).toBe(2);
  });
});
