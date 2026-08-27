import { describe, expect, it } from 'vitest';
import { planReplay, summarizeReplay } from '@/lib/services/alias-replay-plan';

const now = new Date('2026-08-31T05:30:00Z');
const day = 86400 * 1000;

describe('planReplay (#788)', () => {
  it('keeps rows seen inside the window, most expensive first', () => {
    const rows = [
      {
        phrase: 'cheap-recent',
        kind: 'research',
        lastDurationMs: 300,
        lastSeenAt: new Date(now.getTime() - day),
      },
      {
        phrase: 'costly-recent',
        kind: 'validation',
        lastDurationMs: 9000,
        lastSeenAt: new Date(now.getTime() - 3 * day),
      },
      {
        phrase: 'stale',
        kind: 'research',
        lastDurationMs: 50000,
        lastSeenAt: new Date(now.getTime() - 20 * day),
      },
    ];
    expect(planReplay(rows, now, 8).map((r) => r.phrase)).toEqual([
      'costly-recent',
      'cheap-recent',
    ]);
  });

  it('summarizes the run in one line, noting budget skips only when they happened', () => {
    const base = {
      arms: 120,
      counts: 40,
      failed: 2,
      ledgered: 200,
      elapsedMs: 1_500_000,
      budgetMs: 1_500_000,
    };
    expect(summarizeReplay({ ...base, skipped: 38 })).toBe(
      '[alias-replay] warmed 120 arms + 40 counts, 2 failed (38 skipped at the 1500s budget) in 1500s — 200 ledger rows in window',
    );
    expect(summarizeReplay({ ...base, skipped: 0 })).toBe(
      '[alias-replay] warmed 120 arms + 40 counts, 2 failed in 1500s — 200 ledger rows in window',
    );
  });
});
