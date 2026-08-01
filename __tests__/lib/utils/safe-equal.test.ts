import { describe, expect, it } from 'vitest';
import { safeEqual } from '@/lib/utils/api-helpers';

describe('safeEqual', () => {
  it('is true for equal strings, false for different or different-length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
