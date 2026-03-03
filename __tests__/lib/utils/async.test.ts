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
