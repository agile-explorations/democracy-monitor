import { describe, expect, it } from 'vitest';
import { getMonday, latestCompleteWeek } from '@/lib/utils/date-utils';

describe('latestCompleteWeek', () => {
  it('returns the Monday exactly one week before the current week', () => {
    const result = latestCompleteWeek();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const thisMonday = new Date(getMonday(new Date()) + 'T00:00:00Z');
    const expected = new Date(thisMonday);
    expected.setUTCDate(expected.getUTCDate() - 7);
    expect(result).toBe(expected.toISOString().slice(0, 10));
    // A Monday, and strictly in the past — the in-progress week is excluded.
    expect(new Date(result + 'T00:00:00Z').getUTCDay()).toBe(1);
    expect(new Date(result + 'T00:00:00Z').getTime()).toBeLessThan(Date.now());
  });
});
