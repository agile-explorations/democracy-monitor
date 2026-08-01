import { describe, expect, it } from 'vitest';
import { oversightSignals, quarterChunks } from '@/lib/cron/backfill-oversight-gov';

describe('oversightSignals', () => {
  it('derives the five signals with their categories from CATEGORIES', () => {
    const signals = oversightSignals();
    expect(signals.map((s) => `${s.id}→${s.category}`).sort()).toEqual([
      'oig_oversight_elections→elections',
      'oig_oversight_fiscal→fiscal',
      'oig_oversight_icig→executiveOversight',
      'oig_oversight_opm→civilService',
      'oig_oversight_state→executiveOversight',
    ]);
  });

  it('every signal URL parses to known facet IDs (no drift vs the fetcher map)', async () => {
    const { parseOversightGovParams } = await import('@/lib/services/oversight-gov-fetcher');
    for (const signal of oversightSignals()) {
      expect(() => parseOversightGovParams(signal.url)).not.toThrow();
    }
  });
});

describe('quarterChunks', () => {
  it('splits a term window into quarterly chunks with no gaps or overlaps', () => {
    const chunks = quarterChunks('2025-01-20', '2026-08-01');
    expect(chunks[0]).toEqual({ from: '2025-01-20', to: '2025-04-19' });
    expect(chunks[chunks.length - 1].to).toBe('2026-08-01');
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = new Date(`${chunks[i - 1].to}T00:00:00Z`).getTime();
      const nextStart = new Date(`${chunks[i].from}T00:00:00Z`).getTime();
      expect(nextStart - prevEnd).toBe(86_400_000);
    }
  });

  it('returns a single chunk for a sub-quarter window', () => {
    expect(quarterChunks('2026-07-01', '2026-08-01')).toEqual([
      { from: '2026-07-01', to: '2026-08-01' },
    ]);
  });

  it('covers a full four-year window without dropping the final partial chunk', () => {
    const chunks = quarterChunks('2017-01-20', '2021-01-19');
    expect(chunks[0].from).toBe('2017-01-20');
    expect(chunks[chunks.length - 1].to).toBe('2021-01-19');
    expect(chunks.length).toBe(16);
  });
});
