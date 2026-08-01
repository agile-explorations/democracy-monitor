import type { NextApiRequest } from 'next';
import { describe, expect, it, vi } from 'vitest';
import { rateLimitHit } from '@/lib/cache';
import {
  RATE_LIMITS,
  checkRateLimit,
  checkRateLimitShared,
  enforceRateLimit,
  getClientIp,
} from '@/lib/utils/rate-limit';

vi.mock('@/lib/cache', () => ({ rateLimitHit: vi.fn() }));

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

  it('prefers CF-Connecting-IP over x-forwarded-for when behind Cloudflare', () => {
    expect(
      getClientIp(req({ 'cf-connecting-ip': '198.51.100.42', 'x-forwarded-for': '172.16.0.1' })),
    ).toBe('198.51.100.42');
  });

  it('prefers the first x-forwarded-for hop when no CF header', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
  });

  it('falls back to the socket address, then unknown', () => {
    expect(getClientIp(req({}, '198.51.100.7'))).toBe('198.51.100.7');
    expect(getClientIp(req({}))).toBe('unknown');
  });

  it('ignores x-forwarded-for in production — keys on the unspoofable socket address (#633)', () => {
    const prev = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = 'production';
      // A spoofed XFF must NOT create a fresh rate-limit bucket in production.
      expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4' }, '198.51.100.7'))).toBe(
        '198.51.100.7',
      );
      // cf-connecting-ip (set by Cloudflare, unspoofable) still wins.
      expect(
        getClientIp(req({ 'cf-connecting-ip': '198.51.100.42', 'x-forwarded-for': '1.2.3.4' })),
      ).toBe('198.51.100.42');
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev as string;
    }
  });
});

describe('checkRateLimitShared (Redis-backed, #615)', () => {
  const policy = { windowMs: 60_000, maxRequests: 3, keyPrefix: 'rl:test' };

  it('allows up to the limit then blocks, keyed via Redis INCR', async () => {
    let counter = 0;
    vi.mocked(rateLimitHit).mockImplementation(async () => ++counter);
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimitShared('ip-a', policy)).allowed).toBe(true);
    }
    const blocked = await checkRateLimitShared('ip-a', policy);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(policy.windowMs);
  });

  it('falls back to the in-memory limiter when Redis is unavailable', async () => {
    vi.mocked(rateLimitHit).mockResolvedValue(null);
    const strict = { windowMs: 60_000, maxRequests: 1, keyPrefix: 'rl:fallback' };
    expect((await checkRateLimitShared('ip-b', strict)).allowed).toBe(true);
    expect((await checkRateLimitShared('ip-b', strict)).allowed).toBe(false);
  });
});

describe('enforceRateLimit (#615)', () => {
  // Capture the response STATE (status/headers written), so assertions check
  // what the handler produced rather than which mock methods were called.
  function captureRes() {
    const state: { statusCode?: number; headers: Record<string, unknown> } = { headers: {} };
    const res = {
      setHeader: (k: string, v: unknown) => {
        state.headers[k] = v;
      },
      status: (code: number) => {
        state.statusCode = code;
        return res;
      },
      json: () => res,
    } as unknown as import('next').NextApiResponse;
    return { res, state };
  }
  const req = {
    headers: { 'x-forwarded-for': 'z.z.z.z' },
    socket: {},
  } as unknown as NextApiRequest;

  it('returns true and writes no status when allowed', async () => {
    vi.mocked(rateLimitHit).mockResolvedValue(1);
    const { res, state } = captureRes();
    expect(await enforceRateLimit(req, res, RATE_LIMITS.search)).toBe(true);
    expect(state.statusCode).toBeUndefined();
  });

  it('returns false and writes 429 + Retry-After when blocked', async () => {
    vi.mocked(rateLimitHit).mockResolvedValue(9999);
    const { res, state } = captureRes();
    expect(await enforceRateLimit(req, res, RATE_LIMITS.email)).toBe(false);
    expect(state.statusCode).toBe(429);
    expect(typeof state.headers['Retry-After']).toBe('number');
  });
});
