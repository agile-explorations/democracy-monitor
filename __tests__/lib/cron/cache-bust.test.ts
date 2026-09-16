import { describe, expect, it } from 'vitest';
import { BUSTABLE_KEYS, resolveBustKeys } from '@/lib/cron/cache-bust';

describe('cache:bust argument resolution', () => {
  it('maps reader-facing names to their cache keys', () => {
    expect(resolveBustKeys(['--key', 'document-count'])).toEqual([
      BUSTABLE_KEYS['document-count'](),
    ]);
  });

  it('refuses unknown names and empty input', () => {
    expect(() => resolveBustKeys(['--key', 'search:arm:*'])).toThrow(/unknown cache name/);
    expect(() => resolveBustKeys([])).toThrow(/at least one/);
  });
});
