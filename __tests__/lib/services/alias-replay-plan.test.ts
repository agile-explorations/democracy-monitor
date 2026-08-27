import { describe, expect, it } from 'vitest';
import { planReplay, replayTier, summarizeReplay } from '@/lib/services/alias-replay-plan';

const now = new Date('2026-08-31T05:30:00Z');
const day = 86400 * 1000;

describe('planReplay (#788)', () => {
  it('classifies tiers by kind and the junk-count threshold', () => {
    expect(replayTier({ kind: 'research', lastDurationMs: 90000 })).toBe(0);
    expect(replayTier({ kind: 'validation', lastDurationMs: 29999 })).toBe(1);
    expect(replayTier({ kind: 'validation', lastDurationMs: 30000 })).toBe(2);
  });

  it('orders arms → ordinary counts → junk counts, then recency, then cost; drops stale rows', () => {
    const rows = [
      {
        phrase: 'junk-count-recent',
        kind: 'validation',
        lastDurationMs: 61000,
        lastSeenAt: new Date(now.getTime() - day),
      },
      {
        phrase: 'count-older',
        kind: 'validation',
        lastDurationMs: 9000,
        lastSeenAt: new Date(now.getTime() - 3 * day),
      },
      {
        phrase: 'count-recent',
        kind: 'validation',
        lastDurationMs: 2000,
        lastSeenAt: new Date(now.getTime() - day),
      },
      {
        phrase: 'arm-older',
        kind: 'research',
        lastDurationMs: 300,
        lastSeenAt: new Date(now.getTime() - 5 * day),
      },
      {
        phrase: 'arm-recent-cheap',
        kind: 'research',
        lastDurationMs: 300,
        lastSeenAt: new Date(now.getTime() - day),
      },
      {
        phrase: 'arm-recent-costly',
        kind: 'explore',
        lastDurationMs: 9000,
        lastSeenAt: new Date(now.getTime() - day),
      },
      {
        phrase: 'stale',
        kind: 'research',
        lastDurationMs: 50000,
        lastSeenAt: new Date(now.getTime() - 20 * day),
      },
    ];
    expect(planReplay(rows, now, 8).map((r) => r.phrase)).toEqual([
      'arm-recent-costly',
      'arm-recent-cheap',
      'arm-older',
      'count-recent',
      'count-older',
      'junk-count-recent',
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
