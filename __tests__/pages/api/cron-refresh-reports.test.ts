import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startReportRefresh } from '@/lib/services/report-refresh';
import handler from '@/pages/api/cron/refresh-reports';

vi.mock('@/lib/services/report-refresh', () => ({
  startReportRefresh: vi.fn(async () => ({ started: true, startedAt: '2026-01-01T00:00:00.000Z' })),
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

  it('rejects non-POST methods', async () => {
    const res = buildRes();
    await handler(buildReq('GET', 'test-secret'), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects a missing or wrong bearer token', async () => {
    const res = buildRes();
    await handler(buildReq('POST', 'wrong'), res);
    expect(res.statusCode).toBe(401);
  });

  it('is unavailable when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = buildRes();
    await handler(buildReq('POST'), res);
    expect(res.statusCode).toBe(503);
  });

  it('accepts a valid token and starts the refresh', async () => {
    vi.mocked(startReportRefresh).mockResolvedValueOnce({
      started: true,
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = buildRes();
    await handler(buildReq('POST', 'test-secret'), res);
    expect(res.statusCode).toBe(202);
    expect(res.body.status).toBe('started');
  });

  it('returns 409 in_progress when a refresh is already running', async () => {
    vi.mocked(startReportRefresh).mockResolvedValueOnce({
      started: false,
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = buildRes();
    await handler(buildReq('POST', 'test-secret'), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.status).toBe('in_progress');
  });
});
