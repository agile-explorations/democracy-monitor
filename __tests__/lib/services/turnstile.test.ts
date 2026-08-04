import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from '@/lib/services/turnstile';

/** A fetch that throws if called — lets tests prove a code path never hits the
 *  network by observing that the result is still correct (not by mock spying). */
const throwingFetch = (() => {
  throw new Error('fetch should not have been called');
}) as unknown as typeof fetch;

describe('verifyTurnstile', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('accepts (skips the check) when TURNSTILE_SECRET_KEY is unset — even if the network is down', async () => {
    global.fetch = throwingFetch;
    expect(await verifyTurnstile('anything')).toBe(true);
  });

  describe('when configured', () => {
    beforeEach(() => {
      process.env.TURNSTILE_SECRET_KEY = 'secret';
    });

    it('rejects a missing token (no siteverify call needed)', async () => {
      global.fetch = throwingFetch;
      expect(await verifyTurnstile(undefined)).toBe(false);
    });

    it('accepts only when siteverify reports success', async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true }),
      })) as unknown as typeof fetch;
      expect(await verifyTurnstile('good-token')).toBe(true);
    });

    it('rejects when siteverify reports failure', async () => {
      global.fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      })) as unknown as typeof fetch;
      expect(await verifyTurnstile('bad-token')).toBe(false);
    });

    it('rejects (does not throw) on a network error', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;
      expect(await verifyTurnstile('token')).toBe(false);
    });
  });
});
