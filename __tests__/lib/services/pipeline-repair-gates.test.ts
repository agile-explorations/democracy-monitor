import { describe, expect, it, vi } from 'vitest';
import type { NegativeControlResult } from '@/lib/services/event-validation-checks';
import {
  captureStatuses,
  diffStatuses,
  evaluateFlipGate,
  regressedControls,
} from '@/lib/services/pipeline-repair-gates';
import type { StatusFlip } from '@/lib/services/pipeline-repair-gates';

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    execute: vi.fn().mockResolvedValue({
      rows: [
        { category: 'hatch', week_of: '2026-06-29', status: 'Stable' },
        { category: 'elections', week_of: '2026-06-29', status: 'Elevated' },
      ],
    }),
  }),
}));

const flip = (over: Partial<StatusFlip> = {}): StatusFlip => ({
  category: 'hatch',
  weekOf: '2026-06-29',
  from: 'Stable',
  to: 'Elevated',
  ...over,
});

describe('captureStatuses', () => {
  it('maps category-week rows to a status snapshot', async () => {
    const snap = await captureStatuses('2026-06-01', '2026-07-13');
    expect(snap.get('hatch|2026-06-29')).toBe('Stable');
    expect(snap.get('elections|2026-06-29')).toBe('Elevated');
    expect(snap.size).toBe(2);
  });
});

describe('diffStatuses', () => {
  it('returns only changed category-weeks, sorted', () => {
    const pre = new Map([
      ['hatch|2026-06-29', 'Stable'],
      ['elections|2026-06-29', 'Elevated'],
    ]);
    const post = new Map([
      ['hatch|2026-06-29', 'Elevated'],
      ['elections|2026-06-29', 'Elevated'],
    ]);
    expect(diffStatuses(pre, post)).toEqual([flip()]);
  });

  it('treats appearing and disappearing rows as flips from/to (none)', () => {
    const pre = new Map([['hatch|2026-06-29', 'Stable']]);
    const post = new Map([['elections|2026-07-06', 'Elevated']]);
    expect(diffStatuses(pre, post)).toEqual([
      flip({ category: 'elections', weekOf: '2026-07-06', from: '(none)', to: 'Elevated' }),
      flip({ to: '(none)' }),
    ]);
  });

  it('returns empty for identical snapshots', () => {
    const snap = new Map([['hatch|2026-06-29', 'Stable']]);
    expect(diffStatuses(snap, new Map(snap))).toEqual([]);
  });
});

describe('evaluateFlipGate', () => {
  it('passes matched flips and flags unexpected ones', () => {
    const actual = [flip(), flip({ category: 'elections' })];
    const gate = evaluateFlipGate(actual, [flip()]);
    expect(gate.matched).toEqual([flip()]);
    expect(gate.unexpected).toEqual([flip({ category: 'elections' })]);
    expect(gate.missing).toEqual([]);
  });

  it('reports expected flips that did not occur as missing', () => {
    const gate = evaluateFlipGate([], [flip()]);
    expect(gate.missing).toEqual([flip()]);
    expect(gate.unexpected).toEqual([]);
  });

  it('requires from/to to match, not just the category-week', () => {
    const gate = evaluateFlipGate([flip({ to: 'ConfirmedConcern' })], [flip()]);
    expect(gate.unexpected).toEqual([flip({ to: 'ConfirmedConcern' })]);
  });
});

describe('regressedControls', () => {
  const nc = (id: string, pass: boolean): NegativeControlResult =>
    ({ id, pass, actual: 0.1, threshold: 0.2 }) as NegativeControlResult;

  it('flags controls that flipped pass to fail', () => {
    const pre = [nc('NC-1', true), nc('NC-2', false)];
    const post = [nc('NC-1', false), nc('NC-2', false)];
    expect(regressedControls(pre, post).map((c) => c.id)).toEqual(['NC-1']);
  });

  it('ignores controls that were already failing or still pass', () => {
    const pre = [nc('NC-1', true), nc('NC-2', false)];
    const post = [nc('NC-1', true), nc('NC-2', false)];
    expect(regressedControls(pre, post)).toEqual([]);
  });
});
