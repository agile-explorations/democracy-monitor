import { describe, expect, it } from 'vitest';
import { makeAdminToken, safeEqual, verifyAdminToken } from '@/lib/utils/api-helpers';

describe('safeEqual', () => {
  it('is true for equal strings, false for different or different-length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('admin session token (#619 R11)', () => {
  const pw = 'super-secret-password';
  const future = Date.now() + 60_000;

  it('verifies a fresh, correctly-signed token', () => {
    expect(verifyAdminToken(pw, makeAdminToken(pw, future))).toBe(true);
  });

  it('rejects an expired token even if the HMAC is valid', () => {
    expect(verifyAdminToken(pw, makeAdminToken(pw, Date.now() - 1000))).toBe(false);
  });

  it('rejects a token signed with a different password', () => {
    expect(verifyAdminToken(pw, makeAdminToken('other-pw', future))).toBe(false);
  });

  it('rejects a tampered expiry — extending it breaks the HMAC', () => {
    const [, mac] = makeAdminToken(pw, future).split('.');
    expect(verifyAdminToken(pw, `${future + 999_999}.${mac}`)).toBe(false);
  });

  it('rejects malformed or missing tokens', () => {
    expect(verifyAdminToken(pw, undefined)).toBe(false);
    expect(verifyAdminToken(pw, 'garbage')).toBe(false);
    expect(verifyAdminToken(pw, '.abc')).toBe(false);
  });
});
