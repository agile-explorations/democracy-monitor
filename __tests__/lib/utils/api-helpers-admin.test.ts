import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, describe, expect, it } from 'vitest';
import { makeAdminToken, requireAdmin } from '@/lib/utils/api-helpers';

function buildRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as NextApiResponse & { statusCode: number };
}

const reqWith = (cookies: Record<string, string>) => ({ cookies }) as unknown as NextApiRequest;

describe('requireAdmin', () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it('is unavailable when no admin password is configured', () => {
    const res = buildRes();
    expect(requireAdmin(reqWith({}), res)).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  it('rejects a missing or wrong session cookie', () => {
    process.env.ADMIN_PASSWORD = 'pw';
    const res = buildRes();
    expect(requireAdmin(reqWith({ dm_admin_session: 'nope' }), res)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('accepts the HMAC-derived session cookie', () => {
    process.env.ADMIN_PASSWORD = 'pw';
    const res = buildRes();
    expect(requireAdmin(reqWith({ dm_admin_session: makeAdminToken('pw') }), res)).toBe(true);
    expect(res.statusCode).toBe(0);
  });

  it('derives a stable token from the password', () => {
    expect(makeAdminToken('pw')).toBe(makeAdminToken('pw'));
    expect(makeAdminToken('pw')).not.toBe(makeAdminToken('other'));
  });
});
