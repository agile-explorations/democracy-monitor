import { describe, expect, it } from 'vitest';
import { hashQuery as serverHash } from '@/lib/services/search-docs-response';
import { hashQuery as clientHash } from '@/scripts/loadtest/client';
import { pct } from '@/scripts/loadtest/collect';

describe('loadtest harness (#781)', () => {
  it('client hashQuery matches the server implementation exactly', () => {
    for (const q of ['A Question ', 'what happened?', '  MIXED case  ']) {
      expect(clientHash(q)).toBe(serverHash(q));
    }
  });

  it('pct computes stable percentiles', () => {
    expect(pct([], 50)).toBeNull();
    expect(pct([10], 50)).toBe(10);
    expect(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(6);
    expect(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });

  it('question bank has no collisions with eval or prewarm questions', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const bank = JSON.parse(readFileSync('scripts/loadtest/questions.json', 'utf8')) as Array<{
      q: string;
    }>;
    const reserved = new Set<string>();
    const checklists = JSON.parse(readFileSync('scripts/completeness-checklists.json', 'utf8')) as {
      questions: Array<{ q: string }>;
    };
    checklists.questions.forEach((q) => reserved.add(serverHash(q.q)));
    const prewarm = JSON.parse(readFileSync('scripts/prewarm-questions.json', 'utf8')) as Array<{
      url: string;
    }>;
    prewarm.forEach((p) => {
      const q = new URL(p.url).searchParams.get('q');
      if (q) reserved.add(serverHash(q));
    });
    expect(bank.length).toBeGreaterThanOrEqual(90);
    expect(bank.filter((b) => reserved.has(serverHash(b.q)))).toEqual([]);
  });
});

describe('interleaved-protocol gate (#786)', () => {
  const report = (label: string, probes: Array<[string, number | null]>) =>
    ({
      run: { profile: 'p0', label, startedAt: '', endedAt: '', baseUrl: '' },
      probes: probes.map(([id, t]) => ({ id, hash: id, tResultsMs: t, tBuildCompleteMs: t })),
      browse: [],
      health: [],
    }) as never;

  it('takes per-probe medians across reports and treats a DNF majority as DNF', async () => {
    const { probeMedians } = await import('@/scripts/loadtest/collect');
    const medians = probeMedians([
      report('a1', [
        ['1a', 100],
        ['1c', null],
      ]),
      report('a2', [
        ['1a', 80],
        ['1c', 200],
      ]),
      report('a3', [
        ['1a', 90],
        ['1c', null],
      ]),
    ]);
    expect(medians).toEqual([
      { id: '1a', medianMs: 90, runs: 3 },
      { id: '1c', medianMs: null, runs: 3 },
    ]);
    // exactly half DNF (1 of 2) is a DNF median; 1 of 3 is not (pct's upper-index
    // convention makes the median of the two finished runs the larger one)
    expect(
      probeMedians([report('b1', [['1c', null]]), report('b2', [['1c', 200]])]).map(
        (m) => m.medianMs,
      ),
    ).toEqual([null]);
    expect(
      probeMedians([
        report('c1', [['1c', null]]),
        report('c2', [['1c', 200]]),
        report('c3', [['1c', 220]]),
      ]).map((m) => m.medianMs),
    ).toEqual([220]);
  });

  it('passes exactly when medians meet the budget with no DNF probe', async () => {
    const { evaluateGate } = await import('@/scripts/loadtest/collect');
    const budget = { p50Ms: 120_000, p95Ms: 240_000, maxDnf: 0 };
    const ok = evaluateGate(
      [
        { id: '1a', medianMs: 90_000, runs: 2 },
        { id: '1b', medianMs: 110_000, runs: 2 },
        { id: '1c', medianMs: 200_000, runs: 2 },
      ],
      budget,
    );
    expect(ok.pass).toBe(true);
    const slow = evaluateGate(
      [
        { id: '1a', medianMs: 130_000, runs: 2 },
        { id: '1c', medianMs: null, runs: 2 },
      ],
      budget,
    );
    expect(slow.pass).toBe(false);
    expect(slow.reasons).toEqual(['p50 130000 > 120000', '1 probe(s) DNF > 0']);
  });

  it('cache summary aggregates hit rates over rows that carry a tally', async () => {
    const { cacheSummary } = await import('@/scripts/loadtest/collect');
    expect(
      cacheSummary([
        { cacheStats: { armHits: 3, armMisses: 1, countHits: 0, countMisses: 4 } },
        { cache_stats: { armHits: 1, armMisses: 3, countHits: 4, countMisses: 0 } },
        {},
      ]),
    ).toEqual({ rows: 2, armHitRate: 0.5, countHitRate: 0.5 });
  });
});
