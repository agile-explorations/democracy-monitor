import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/cron/refresh-reports';

vi.mock('@/lib/cron/snapshot-poststeps', () => ({
  tryValidateGraph: vi.fn(async () => 0),
  tryStoreDataReport: vi.fn(async () => undefined),
}));

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
    setHeader() {
      return this;
    },
    end() {
      return this;
    },
  };
  return res as unknown as NextApiResponse & { statusCode: number; body: { status?: string } };
}

function buildReq(method: string, token?: string): NextApiRequest {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as NextApiRequest;
}

describe('POST /api/cron/refresh-reports', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
  });

  it('rejects non-POST methods', () => {
    const res = buildRes();
    handler(buildReq('GET', 'test-secret'), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects a missing or wrong bearer token', () => {
    const res = buildRes();
    handler(buildReq('POST', 'wrong'), res);
    expect(res.statusCode).toBe(401);
  });

  it('is unavailable when CRON_SECRET is not configured', () => {
    delete process.env.CRON_SECRET;
    const res = buildRes();
    handler(buildReq('POST'), res);
    expect(res.statusCode).toBe(503);
  });

  it('accepts a valid token and starts the refresh in the background', async () => {
    const res = buildRes();
    handler(buildReq('POST', 'test-secret'), res);
    expect(res.statusCode).toBe(202);
    expect(res.body.status).toBe('started');
    // Let the fire-and-forget refresh settle so inFlight resets for other tests.
    await new Promise((r) => setTimeout(r, 0));
  });
});
