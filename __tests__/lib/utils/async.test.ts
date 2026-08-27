import { describe, it, expect } from 'vitest';
import { mapConcurrent } from '@/lib/utils/async';

describe('mapConcurrent', () => {
  it('returns results in input order', async () => {
    const items = [3, 1, 2];
    const result = await mapConcurrent(items, 3, async (n) => n * 10);
    expect(result).toEqual([30, 10, 20]);
  });

  it('handles empty input', async () => {
    const result = await mapConcurrent([], 5, async (n: number) => n);
    expect(result).toEqual([]);
  });

  it('respects concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;

    const result = await mapConcurrent([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
      return n;
    });

    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(result).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('handles concurrency greater than item count', async () => {
    const result = await mapConcurrent([1, 2], 10, async (n) => n + 1);
    expect(result).toEqual([2, 3]);
  });

  it('propagates errors from the worker function', async () => {
    await expect(
      mapConcurrent([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });
});

describe('singleflight (#782 WO-5)', () => {
  it('shares one invocation among concurrent callers with the same key', async () => {
    const { singleflight } = await import('@/lib/utils/async');
    let calls = 0;
    let release!: (v: string) => void;
    const fn = () => {
      calls++;
      return new Promise<string>((r) => (release = r));
    };
    const a = singleflight('k1', fn);
    const b = singleflight('k1', fn);
    release('shared');
    expect(await Promise.all([a, b])).toEqual(['shared', 'shared']);
    expect(calls).toBe(1);
  });

  it('runs fresh once the in-flight call has settled', async () => {
    const { singleflight } = await import('@/lib/utils/async');
    let calls = 0;
    const fn = async () => ++calls;
    expect(await singleflight('k2', fn)).toBe(1);
    expect(await singleflight('k2', fn)).toBe(2);
  });

  it('keys are independent', async () => {
    const { singleflight } = await import('@/lib/utils/async');
    const [x, y] = await Promise.all([
      singleflight('k3', async () => 'x'),
      singleflight('k4', async () => 'y'),
    ]);
    expect([x, y]).toEqual(['x', 'y']);
  });

  it('propagates a rejection to every joiner and clears the entry', async () => {
    const { singleflight } = await import('@/lib/utils/async');
    const failing = () => Promise.reject(new Error('boom'));
    const a = singleflight('k5', failing);
    const b = singleflight('k5', failing);
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
    expect(await singleflight('k5', async () => 'recovered')).toBe('recovered');
  });
});

describe('createLimiter (#782 WO-5)', () => {
  it('never runs more than the limit at once and preserves results', async () => {
    const { createLimiter } = await import('@/lib/utils/async');
    const gate = createLimiter(2);
    let running = 0;
    let maxRunning = 0;
    const task = (n: number) =>
      gate(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return n;
      });
    const out = await Promise.all([1, 2, 3, 4, 5].map(task));
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(maxRunning).toBe(2);
  });

  it('releases the slot when a task throws', async () => {
    const { createLimiter } = await import('@/lib/utils/async');
    const gate = createLimiter(1);
    await expect(gate(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await gate(async () => 'next')).toBe('next');
  });

  it('a non-positive limit is a pass-through', async () => {
    const { createLimiter } = await import('@/lib/utils/async');
    const gate = createLimiter(0);
    let running = 0;
    let maxRunning = 0;
    await Promise.all(
      [1, 2, 3].map(() =>
        gate(async () => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await new Promise((r) => setTimeout(r, 5));
          running--;
        }),
      ),
    );
    expect(maxRunning).toBe(3);
  });
});

describe('mapConcurrentUntil (#788)', () => {
  it('skips items not yet started once the stop condition holds, finishing in-flight work', async () => {
    const { mapConcurrentUntil } = await import('@/lib/utils/async');
    let started = 0;
    const { results, skipped } = await mapConcurrentUntil(
      [1, 2, 3, 4, 5, 6],
      2,
      () => started >= 3,
      async (n) => {
        started++;
        await new Promise((r) => setTimeout(r, 5));
        return n * 10;
      },
    );
    expect(results.filter((r) => r !== undefined)).toEqual([10, 20, 30]);
    expect(skipped).toBe(3);
  });

  it('runs everything when the condition never holds and bounds concurrency', async () => {
    const { mapConcurrentUntil } = await import('@/lib/utils/async');
    let running = 0;
    let peak = 0;
    const { results, skipped } = await mapConcurrentUntil(
      [1, 2, 3, 4],
      2,
      () => false,
      async (n) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return n;
      },
    );
    expect(results).toEqual([1, 2, 3, 4]);
    expect(skipped).toBe(0);
    expect(peak).toBe(2);
  });
});
