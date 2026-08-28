import { describe, expect, it } from 'vitest';
import { CL_MAX_RETRIES, planClusterAttempts } from '@/lib/services/cl-cluster-plan';
import type { LedgerEntry } from '@/lib/services/cl-cluster-plan';

const ids = (n: number[]) => n.map((id) => ({ id }));
const idOf = (c: { id: number }) => c.id;

describe('planClusterAttempts (#741)', () => {
  it('attempts unknown clusters and retries no-text / fetch-error ones', () => {
    const ledger = new Map<number, LedgerEntry>([
      [2, { reason: 'no_text', attempts: 1 }],
      [3, { reason: 'fetch_error', attempts: 2 }],
    ]);
    const plan = planClusterAttempts(ids([1, 2, 3]), idOf, ledger);
    expect(plan.attempt.map(idOf)).toEqual([1, 2, 3]);
    expect(plan).toMatchObject({ skippedFinal: 0, skippedExhausted: 0, deferred: 0 });
  });

  it('never re-attempts a stored or off-topic cluster', () => {
    const ledger = new Map<number, LedgerEntry>([
      [1, { reason: 'stored', attempts: 1 }],
      [2, { reason: 'zero_categories', attempts: 1 }],
    ]);
    const plan = planClusterAttempts(ids([1, 2, 3]), idOf, ledger);
    expect(plan.attempt.map(idOf)).toEqual([3]);
    expect(plan.skippedFinal).toBe(2);
  });

  it('gives up after the retry ceiling', () => {
    const ledger = new Map<number, LedgerEntry>([
      [1, { reason: 'no_text', attempts: CL_MAX_RETRIES }],
      [2, { reason: 'no_text', attempts: CL_MAX_RETRIES - 1 }],
    ]);
    const plan = planClusterAttempts(ids([1, 2]), idOf, ledger);
    expect(plan.attempt.map(idOf)).toEqual([2]);
    expect(plan.skippedExhausted).toBe(1);
  });

  it('caps the run and defers the rest, in order', () => {
    const plan = planClusterAttempts(ids([1, 2, 3, 4]), idOf, new Map(), { maxFetches: 2 });
    expect(plan.attempt.map(idOf)).toEqual([1, 2]);
    expect(plan.deferred).toBe(2);
  });
});
