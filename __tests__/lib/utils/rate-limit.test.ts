import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, getClientIp, _resetRateLimiter } from '@/lib/utils/rate-limit';

describe('rate-limit', () => {
  afterEach(() => {
    _resetRateLimiter();
  });

  it('allows the first request', () => {
    const result = checkRateLimit('1.2.3.4', { windowMs: 1000, maxRequests: 1 });
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it('blocks when at max requests within window', () => {
    checkRateLimit('1.2.3.4', { windowMs: 1000, maxRequests: 2 });
    checkRateLimit('1.2.3.4', { windowMs: 1000, maxRequests: 2 });
    const result = checkRateLimit('1.2.3.4', { windowMs: 1000, maxRequests: 2 });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('allows requests from different IPs independently', () => {
    checkRateLimit('1.1.1.1', { windowMs: 1000, maxRequests: 1 });
    const result = checkRateLimit('2.2.2.2', { windowMs: 1000, maxRequests: 1 });
    expect(result.allowed).toBe(true);
  });

  it('allows requests after window expires', async () => {
    const opts = { windowMs: 50, maxRequests: 1 };
    checkRateLimit('1.2.3.4', opts);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    const result = checkRateLimit('1.2.3.4', opts);
    expect(result.allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for header', () => {
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never;
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('extracts single IP from x-forwarded-for', () => {
    const req = {
      headers: { 'x-forwarded-for': '10.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never;
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('falls back to socket.remoteAddress', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '192.168.1.1' },
    } as never;
    expect(getClientIp(req)).toBe('192.168.1.1');
  });

  it('returns unknown when no IP available', () => {
    const req = {
      headers: {},
      socket: {},
    } as never;
    expect(getClientIp(req)).toBe('unknown');
  });
});

describe('rate-limit cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetRateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetRateLimiter();
  });

  it('removes IPs with only stale timestamps after cleanup runs', () => {
    // Add a request at the current time
    checkRateLimit('stale-ip', { windowMs: 1000, maxRequests: 10 });

    // Advance past the MAX_WINDOW_MS (60s) so the timestamp becomes stale
    vi.advanceTimersByTime(61_000);

    // Trigger the cleanup interval (runs every 60s)
    vi.advanceTimersByTime(60_000);

    // The stale IP's entries should have been cleaned up.
    // A new request from the same IP should be allowed (fresh state).
    const result = checkRateLimit('stale-ip', { windowMs: 1000, maxRequests: 1 });
    expect(result.allowed).toBe(true);
  });

  it('keeps IPs with recent timestamps after cleanup runs', () => {
    const opts = { windowMs: 1000, maxRequests: 2 };

    // Add a request near the cleanup trigger time
    checkRateLimit('active-ip', opts);

    // Advance to just before MAX_WINDOW_MS expires, then add another request
    vi.advanceTimersByTime(50_000);
    checkRateLimit('active-ip', opts);

    // Trigger cleanup — the second request is still within MAX_WINDOW_MS
    vi.advanceTimersByTime(60_000);

    // The active IP should still have state (second request is recent)
    // so the next request should be the 2nd in the window => allowed
    const result = checkRateLimit('active-ip', opts);
    expect(result.allowed).toBe(true);
  });
});
