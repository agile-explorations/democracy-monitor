import { afterEach, describe, expect, it } from 'vitest';
import { envInt } from '@/lib/utils/env';

describe('envInt (#782 WO-3 tuning knobs)', () => {
  afterEach(() => {
    delete process.env.WO3_TEST_KNOB;
  });

  it('returns the fallback when unset or empty', () => {
    expect(envInt('WO3_TEST_KNOB', 5, 1, 10)).toBe(5);
    process.env.WO3_TEST_KNOB = '  ';
    expect(envInt('WO3_TEST_KNOB', 5, 1, 10)).toBe(5);
  });

  it('returns an in-range integer override', () => {
    process.env.WO3_TEST_KNOB = '8';
    expect(envInt('WO3_TEST_KNOB', 5, 1, 10)).toBe(8);
  });

  it('rejects out-of-range, non-integer, and garbage values', () => {
    for (const bad of ['0', '11', '3.5', 'ten', '-2']) {
      process.env.WO3_TEST_KNOB = bad;
      expect(envInt('WO3_TEST_KNOB', 5, 1, 10)).toBe(5);
    }
  });
});
