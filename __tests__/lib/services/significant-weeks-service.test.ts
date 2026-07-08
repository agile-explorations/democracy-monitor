import { describe, it, expect } from 'vitest';
import {
  rankSignificantWeeks,
  MAX_SIGNIFICANT_WEEKS,
} from '@/lib/services/significant-weeks-service';
import type { WeekStatusRow } from '@/lib/services/significant-weeks-service';

/** Build rows for one week: `confirmed` categories at ConfirmedConcern, rest Stable. */
function week(weekOf: string, confirmed: string[], stable: string[] = []): WeekStatusRow[] {
  return [
    ...confirmed.map((category) => ({ weekOf, category, status: 'ConfirmedConcern' })),
    ...stable.map((category) => ({ weekOf, category, status: 'Stable' })),
  ];
}

const CATS = ['civilLiberties', 'lawEnforcement', 'elections', 'mediaFreedom', 'rulemaking'];

describe('rankSignificantWeeks', () => {
  it('returns empty for no data', () => {
    expect(rankSignificantWeeks([])).toEqual([]);
  });

  it('returns empty when no week has any ConfirmedConcern', () => {
    const rows = [...week('2026-01-05', [], CATS), ...week('2026-01-12', [], CATS)];
    expect(rankSignificantWeeks(rows)).toEqual([]);
  });

  it('identifies the peak-concern week and ranks it first', () => {
    const rows = [
      ...week('2026-01-05', CATS.slice(0, 1), CATS.slice(1)),
      ...week('2026-01-12', CATS.slice(0, 4), CATS.slice(4)),
      ...week('2026-01-19', CATS.slice(0, 2), CATS.slice(2)),
    ];
    const ranked = rankSignificantWeeks(rows);
    expect(ranked[0].weekOf).toBe('2026-01-12');
    expect(ranked[0].rank).toBe(1);
    const peak = ranked[0].reasons.find((r) => r.type === 'peak_concern');
    expect(peak?.detail).toContain('4 of 5 categories');
  });

  it('breaks peak ties toward the most recent week', () => {
    const rows = [
      ...week('2026-01-05', CATS.slice(0, 3), CATS.slice(3)),
      ...week('2026-02-02', CATS.slice(0, 3), CATS.slice(3)),
    ];
    const ranked = rankSignificantWeeks(rows);
    const peakWeek = ranked.find((w) => w.reasons.some((r) => r.type === 'peak_concern'));
    expect(peakWeek?.weekOf).toBe('2026-02-02');
  });

  it('flags a category entering ConfirmedConcern as a new concern', () => {
    const rows = [
      ...week('2026-01-05', [], CATS),
      ...week(
        '2026-01-12',
        ['elections'],
        CATS.filter((c) => c !== 'elections'),
      ),
    ];
    const ranked = rankSignificantWeeks(rows);
    const entry = ranked.find((w) => w.weekOf === '2026-01-12');
    const reason = entry?.reasons.find((r) => r.type === 'new_concern');
    expect(reason?.detail).toContain('Elections');
    expect(reason?.detail).toContain('entered Confirmed Concern');
  });

  it('does not flag consecutive confirmed weeks as repeated new concerns', () => {
    const rows = [
      ...week('2026-01-05', ['elections']),
      ...week('2026-01-12', ['elections']),
      ...week('2026-01-19', ['elections']),
    ];
    const ranked = rankSignificantWeeks(rows);
    const newConcernWeeks = ranked.filter((w) => w.reasons.some((r) => r.type === 'new_concern'));
    expect(newConcernWeeks.map((w) => w.weekOf)).toEqual(['2026-01-05']);
  });

  it('flags re-entry after a sustained gap as a new concern', () => {
    const rows = [
      ...week('2026-01-05', ['elections']),
      ...week('2026-01-12', [], ['elections']),
      ...week('2026-01-19', [], ['elections']),
      ...week('2026-01-26', [], ['elections']),
      ...week('2026-02-02', [], ['elections']),
      ...week('2026-02-09', ['elections']),
    ];
    const ranked = rankSignificantWeeks(rows);
    const reentry = ranked.find(
      (w) => w.weekOf === '2026-02-09' && w.reasons.some((r) => r.type === 'new_concern'),
    );
    expect(reentry).toBeDefined();
  });

  it('does not flag re-entry after a short gap', () => {
    const rows = [
      ...week('2026-01-05', ['elections']),
      ...week('2026-01-12', [], ['elections']),
      ...week('2026-01-19', ['elections']),
    ];
    const ranked = rankSignificantWeeks(rows);
    const reentry = ranked.find(
      (w) => w.weekOf === '2026-01-19' && w.reasons.some((r) => r.type === 'new_concern'),
    );
    expect(reentry).toBeUndefined();
  });

  it('merges multiple reasons for the same week', () => {
    // Week 2026-01-12: peak (4 confirmed) AND all four are new entries
    const rows = [
      ...week('2026-01-05', [], CATS),
      ...week('2026-01-12', CATS.slice(0, 4), CATS.slice(4)),
    ];
    const ranked = rankSignificantWeeks(rows);
    const types = ranked[0].reasons.map((r) => r.type).sort();
    expect(types).toEqual(['new_concern', 'peak_concern']);
  });

  it('caps output and assigns sequential ranks', () => {
    // 20 weeks, each with a different single new-concern category
    const rows: WeekStatusRow[] = [];
    for (let i = 1; i <= 20; i++) {
      const weekOf = `2026-03-${String(i).padStart(2, '0')}`;
      rows.push({ weekOf, category: `cat${i}`, status: 'ConfirmedConcern' });
    }
    const ranked = rankSignificantWeeks(rows);
    expect(ranked.length).toBeLessThanOrEqual(MAX_SIGNIFICANT_WEEKS);
    expect(ranked.map((w) => w.rank)).toEqual(ranked.map((_, i) => i + 1));
  });

  it('is deterministic for identical input', () => {
    const rows = [
      ...week('2026-01-05', CATS.slice(0, 2), CATS.slice(2)),
      ...week('2026-01-12', CATS.slice(0, 4), CATS.slice(4)),
    ];
    expect(rankSignificantWeeks(rows)).toEqual(rankSignificantWeeks([...rows].reverse()));
  });
});
