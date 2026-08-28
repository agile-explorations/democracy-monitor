import { beforeEach, describe, expect, it, vi } from 'vitest';
import { counterAdjust } from '@/lib/cache';
import {
  claimSourceSlot,
  releaseSourceSlot,
  SOURCE_SLOT_LIMITS,
} from '@/lib/services/search-source-slots';

vi.mock('@/lib/cache', () => ({ counterAdjust: vi.fn() }));

const counters = new Map<string, number>();
beforeEach(() => {
  counters.clear();
  vi.mocked(counterAdjust).mockImplementation(async (key, delta) => {
    const next = Math.max(0, (counters.get(key) ?? 0) + delta);
    counters.set(key, next);
    return next;
  });
});

describe('per-source slots (#793)', () => {
  it('lets a source hold its build limit, refuses the next, and reuses a released slot', async () => {
    const limit = SOURCE_SLOT_LIMITS.build;
    for (let i = 0; i < limit; i++) expect(await claimSourceSlot('build', 'pass:a')).toBe(true);
    expect(await claimSourceSlot('build', 'pass:a')).toBe(false);
    await releaseSourceSlot('build', 'pass:a');
    expect(await claimSourceSlot('build', 'pass:a')).toBe(true);
  });

  it('keeps sources and kinds independent', async () => {
    for (let i = 0; i < SOURCE_SLOT_LIMITS.build; i++) await claimSourceSlot('build', 'pass:a');
    expect(await claimSourceSlot('build', 'pass:b')).toBe(true);
    expect(await claimSourceSlot('stream', 'pass:a')).toBe(true);
    expect(await claimSourceSlot('stream', 'pass:a')).toBe(false); // stream limit is 1
  });

  it('a refused claim does not leave the counter inflated', async () => {
    for (let i = 0; i < SOURCE_SLOT_LIMITS.build; i++) await claimSourceSlot('build', 'pass:a');
    await claimSourceSlot('build', 'pass:a');
    expect(counters.get('search:srcslot:build:pass:a:v1')).toBe(SOURCE_SLOT_LIMITS.build);
  });
});
