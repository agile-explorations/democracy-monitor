import { describe, expect, it } from 'vitest';
import { ledgerCounts, REVERSAL_KIND_LABELS, REVERSALS_LEDGER } from '@/lib/data/reversals-ledger';

describe('reversals ledger (#814)', () => {
  it('is sorted newest first', () => {
    const dates = REVERSALS_LEDGER.map((e) => e.date);
    const sorted = [...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(dates).toEqual(sorted);
  });

  it('every entry carries a date, a reason, and at least one evidence URL', () => {
    for (const e of REVERSALS_LEDGER) {
      expect(e.date, e.what).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.why.trim().length, e.what).toBeGreaterThan(20);
      expect(e.evidence.length, e.what).toBeGreaterThan(0);
      for (const u of e.evidence) expect(u).toMatch(/^https:\/\/github\.com\//);
      expect(REVERSAL_KIND_LABELS[e.kind]).toBeTruthy();
    }
  });

  it('counts every kind, including kinds with no entries', () => {
    const counts = ledgerCounts(REVERSALS_LEDGER);
    expect(Object.keys(counts).sort()).toEqual(
      ['audit', 'correction', 'flip', 'hold', 'policy', 'regeneration'].sort(),
    );
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(REVERSALS_LEDGER.length);
    expect(ledgerCounts([]).correction).toBe(0);
  });
});
