import { describe, expect, it } from 'vitest';
import { isDumpTempStale, STALE_TEMP_MS } from '@/lib/cron/dump-config';

describe('isDumpTempStale (#639)', () => {
  const now = 1_700_000_000_000;

  it('is false for a temp written just now (live dump)', () => {
    expect(isDumpTempStale(now, now)).toBe(false);
    expect(isDumpTempStale(now - 60_000, now)).toBe(false); // 1 min idle
  });

  it('is false just under the threshold', () => {
    expect(isDumpTempStale(now - (STALE_TEMP_MS - 1), now)).toBe(false);
  });

  it('is true past the threshold (dead writer — reclaimable orphan)', () => {
    expect(isDumpTempStale(now - (STALE_TEMP_MS + 1), now)).toBe(true);
    expect(isDumpTempStale(now - 42 * 60_000, now)).toBe(true); // the incident: 42 min idle
  });
});
