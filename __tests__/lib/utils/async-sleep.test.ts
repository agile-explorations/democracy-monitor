import { describe, expect, it } from 'vitest';
import { sleep } from '@/lib/utils/async';
import { formatApproxCount } from '@/lib/utils/math';

describe('sleep', () => {
  it('resolves after roughly the requested delay', async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });
});

describe('formatApproxCount', () => {
  it('rounds down to the nearest 10,000 with "over" phrasing', () => {
    expect(formatApproxCount(234567)).toBe('over 230,000');
    expect(formatApproxCount(451444)).toBe('over 450,000');
  });
});
