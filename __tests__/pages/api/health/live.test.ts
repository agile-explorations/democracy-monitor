import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pingDb } from '@/lib/db';
import handler from '@/pages/api/health/live';

vi.mock('@/lib/db', () => ({
  pingDb: vi.fn(async () => undefined),
  isDbAvailable: vi.fn(() => true),
}));

function buildRes() {
  const res = {
    statusCode: 0,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader() {
      return this;
    },
  };
  return res as unknown as NextApiResponse & { statusCode: number; body: any };
}
const req = (method: string) => ({ method, headers: {}, query: {} }) as unknown as NextApiRequest;

describe('/api/health/live (isolated health pool, 2026-08-24 incident)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 when the dedicated-pool ping succeeds', async () => {
    const res = buildRes();
    await handler(req('GET'), res);
    expect(vi.mocked(pingDb)).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns 503 when the ping fails instead of hanging', async () => {
    vi.mocked(pingDb).mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'));
    const res = buildRes();
    await handler(req('GET'), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ status: 'db-unreachable' });
  });

  it('rejects non-GET methods', async () => {
    const res = buildRes();
    await handler(req('POST'), res);
    expect(res.statusCode).toBe(405);
  });
});
