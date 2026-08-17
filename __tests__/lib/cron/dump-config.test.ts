import { describe, expect, it } from 'vitest';
import { DUMP_HEARTBEAT_STALE_MS } from '@/lib/cron/dump-config';

describe('DUMP_HEARTBEAT_STALE_MS (#731 diskless dumps)', () => {
  it('is generous enough for B2 multipart stalls but bounded', () => {
    expect(DUMP_HEARTBEAT_STALE_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(DUMP_HEARTBEAT_STALE_MS).toBeLessThanOrEqual(30 * 60 * 1000);
  });
});
