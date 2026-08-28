import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from '@/lib/services/turnstile';
import handler from '@/pages/api/search/pass';

vi.mock('@/lib/utils/rate-limit', () => ({
  RATE_LIMITS: { search: {} },
  enforceRateLimit: vi.fn(async () => true),
  getClientIp: () => '1.2.3.4',
}));
vi.mock('@/lib/services/turnstile', () => ({ verifyTurnstile: vi.fn() }));

function buildRes() {
  const r = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(p: unknown) {
      this.body = p;
      return this;
    },
    end() {
      return this;
    },
  };
  return r as unknown as NextApiResponse & {
    statusCode: number;
    body: { code?: string };
    headers: Record<string, string>;
  };
}
const post = (body: unknown) =>
  ({ method: 'POST', headers: {}, query: {}, body }) as unknown as NextApiRequest;

afterEach(() => {
  delete process.env.SEARCH_PASS_SECRET;
});

describe('POST /api/search/pass (#792)', () => {
  it('issues a scoped HttpOnly pass cookie when Turnstile verifies', async () => {
    process.env.SEARCH_PASS_SECRET = 's';
    vi.mocked(verifyTurnstile).mockResolvedValue(true);
    const res = buildRes();
    await handler(post({ turnstileToken: 'tok' }), res);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Set-Cookie']).toMatch(
      /^dm_pass=[0-9a-f]{24}\.\d+\.[0-9a-f]{32}; Path=\/api\/search; HttpOnly/,
    );
  });

  it('rejects a failed verification with a machine-readable code', async () => {
    vi.mocked(verifyTurnstile).mockResolvedValue(false);
    const res = buildRes();
    await handler(post({ turnstileToken: 'bad' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('turnstile_failed');
  });

  it('only accepts POST', async () => {
    const res = buildRes();
    await handler({ method: 'GET', headers: {}, query: {} } as unknown as NextApiRequest, res);
    expect(res.statusCode).toBe(405);
  });
});
