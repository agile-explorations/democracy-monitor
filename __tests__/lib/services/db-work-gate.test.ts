/**
 * Per-request DB budget (#782 WO-5): every statement issued while a
 * request is in flight shares one limiter sized by window count; work
 * outside any request is unthrottled.
 */
import { describe, expect, it } from 'vitest';
import { dbWorkGate, withRequestDbGate } from '@/lib/services/db-work-gate';

async function measurePeak(tasks: number, perTask: () => Promise<void>) {
  let running = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: tasks }, () =>
      dbWorkGate(async () => {
        running++;
        peak = Math.max(peak, running);
        await perTask();
        running--;
      }),
    ),
  );
  return peak;
}

const work = () => new Promise<void>((r) => setTimeout(r, 5));

describe('withRequestDbGate / dbWorkGate', () => {
  it('bounds a single-window request to the per-window budget', async () => {
    const peak = await withRequestDbGate(1, () => measurePeak(30, work), 8);
    expect(peak).toBe(8);
  });

  it('scales the budget with the window count', async () => {
    const peak = await withRequestDbGate(3, () => measurePeak(40, work), 8);
    expect(peak).toBe(24);
  });

  it('applies to statements issued from nested async stages of the request', async () => {
    const peak = await withRequestDbGate(
      1,
      async () => {
        const later = Promise.resolve().then(() => measurePeak(12, work));
        return later;
      },
      4,
    );
    expect(peak).toBe(4);
  });

  it('keeps concurrent requests on separate budgets', async () => {
    const [a, b] = await Promise.all([
      withRequestDbGate(1, () => measurePeak(10, work), 2),
      withRequestDbGate(1, () => measurePeak(10, work), 3),
    ]);
    expect([a, b]).toEqual([2, 3]);
  });

  it('is a pass-through outside any request', async () => {
    const peak = await measurePeak(12, work);
    expect(peak).toBe(12);
  });

  it('releases the slot when a statement throws', async () => {
    await withRequestDbGate(
      1,
      async () => {
        await expect(dbWorkGate(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
        expect(await measurePeak(3, work)).toBe(1);
      },
      1,
    );
  });
});
