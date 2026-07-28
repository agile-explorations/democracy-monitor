import type { NextApiRequest } from 'next';
import { describe, expect, it } from 'vitest';
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit';

describe('checkRateLimit', () => {
  it('allows requests under the limit and blocks at the limit with a retry hint', () => {
    const opts = { windowMs: 60_000, maxRequests: 2 };
    expect(checkRateLimit('1.2.3.4', opts).allowed).toBe(true);
    expect(checkRateLimit('1.2.3.4', opts).allowed).toBe(true);
    const blocked = checkRateLimit('1.2.3.4', opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('tracks IPs independently', () => {
    const opts = { windowMs: 60_000, maxRequests: 1 };
    expect(checkRateLimit('5.6.7.8', opts).allowed).toBe(true);
    expect(checkRateLimit('9.10.11.12', opts).allowed).toBe(true);
    expect(checkRateLimit('5.6.7.8', opts).allowed).toBe(false);
  });

  it('forgets requests that fall outside the window', () => {
    const opts = { windowMs: 1, maxRequests: 1 };
    expect(checkRateLimit('13.14.15.16', opts).allowed).toBe(true);
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* let the 1ms window elapse */
    }
    expect(checkRateLimit('13.14.15.16', opts).allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  const req = (headers: Record<string, unknown>, remoteAddress?: string) =>
    ({ headers, socket: { remoteAddress } }) as unknown as NextApiRequest;

  it('prefers the first x-forwarded-for hop', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
  });

  it('falls back to the socket address, then unknown', () => {
    expect(getClientIp(req({}, '198.51.100.7'))).toBe('198.51.100.7');
    expect(getClientIp(req({}))).toBe('unknown');
  });
});
