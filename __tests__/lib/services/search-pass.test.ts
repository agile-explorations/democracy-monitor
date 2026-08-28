import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, describe, expect, it } from 'vitest';
import {
  passCookieHeader,
  readCookie,
  requireSearchSource,
  resolveSearchSource,
  signPass,
  verifyPass,
} from '@/lib/services/search-pass';

const SECRET = 'test-secret';
const ID = 'a'.repeat(24);
const NOW = 1_800_000_000;

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.SEARCH_MACHINE_TOKEN;
  delete process.env.SEARCH_PASS_SECRET;
  delete process.env.CRON_SECRET;
});

const req = (headers: Record<string, string> = {}) =>
  ({ headers, socket: { remoteAddress: '9.9.9.9' } }) as unknown as NextApiRequest;
const res = () => {
  const r = {
    statusCode: 0,
    body: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(p: unknown) {
      this.body = p;
      return this;
    },
  };
  return r as unknown as NextApiResponse & { statusCode: number; body: { code?: string } };
};

describe('pass signing (#792)', () => {
  it('round-trips a fresh pass and rejects tampering, the wrong secret, and expiry', () => {
    const value = signPass(ID, NOW, SECRET);
    expect(verifyPass(value, SECRET, NOW + 100, 3600)).toBe(ID);
    expect(verifyPass(value.replace(/.$/, '0'), SECRET, NOW + 100, 3600)).toBeNull();
    expect(verifyPass(value, 'other', NOW + 100, 3600)).toBeNull();
    expect(verifyPass(value, SECRET, NOW + 3601, 3600)).toBeNull();
    expect(verifyPass(value, SECRET, NOW - 120, 3600)).toBeNull(); // issued in the future
    expect(verifyPass('garbage', SECRET, NOW, 3600)).toBeNull();
    expect(verifyPass(undefined, SECRET, NOW, 3600)).toBeNull();
  });

  it('cookie helpers scope the pass to /api/search and read it back', () => {
    const header = passCookieHeader('x.1.y', 60);
    expect(header).toContain('dm_pass=x.1.y');
    expect(header).toContain('Path=/api/search');
    expect(header).toContain('HttpOnly');
    expect(readCookie('foo=1; dm_pass=x.1.y; bar=2', 'dm_pass')).toBe('x.1.y');
    expect(readCookie(undefined, 'dm_pass')).toBeUndefined();
  });
});

describe('resolveSearchSource / requireSearchSource (#792)', () => {
  it('is open (client IP source) when nothing is configured', () => {
    expect(resolveSearchSource(req())).toEqual({ kind: 'open', id: 'ip:9.9.9.9' });
  });

  it('accepts the machine token and rejects a wrong one', () => {
    process.env.SEARCH_MACHINE_TOKEN = 'mach';
    expect(resolveSearchSource(req({ authorization: 'Bearer mach' }))).toEqual({
      kind: 'machine',
      id: 'machine:9.9.9.9',
    });
    expect(resolveSearchSource(req({ authorization: 'Bearer nope' }))).toBeNull();
    expect(resolveSearchSource(req())).toBeNull();
  });

  it('accepts a valid human pass when Turnstile is configured, and 403s without one', () => {
    process.env.TURNSTILE_SECRET_KEY = 'ts';
    process.env.SEARCH_PASS_SECRET = SECRET;
    const now = Math.floor(Date.now() / 1000);
    const cookie = `dm_pass=${signPass(ID, now, SECRET)}`;
    expect(resolveSearchSource(req({ cookie }))).toEqual({ kind: 'human', id: `pass:${ID}` });
    const r = res();
    expect(requireSearchSource(req(), r)).toBeNull();
    expect(r.statusCode).toBe(403);
    expect(r.body.code).toBe('pass_required');
  });
});
