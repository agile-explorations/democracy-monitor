import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRefreshStatus, startReportRefresh } from '@/lib/services/report-refresh';
import { enforceRateLimit } from '@/lib/utils/rate-limit';
import handler from '@/pages/api/health/refresh';

vi.mock('@/lib/services/report-refresh', () => ({
  getRefreshStatus: vi.fn(async () => ({ inFlight: false, startedAt: null })),
  startReportRefresh: vi.fn(async () => ({ started: true, startedAt: '2026-01-01T00:00:00.000Z' })),
}));
vi.mock('@/lib/utils/rate-limit', () => ({
  RATE_LIMITS: { reportRefresh: {} },
  enforceRateLimit: vi.fn(async () => true),
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

describe('/api/health/refresh (#650 follow-up)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET returns the in-flight status', async () => {
    vi.mocked(getRefreshStatus).mockResolvedValueOnce({ inFlight: true, startedAt: 'now' });
    const res = buildRes();
    await handler(req('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ inFlight: true, startedAt: 'now' });
  });

  it('POST triggers a refresh (202) when idle', async () => {
    const res = buildRes();
    await handler(req('POST'), res);
    expect(res.statusCode).toBe(202);
    expect(res.body.status).toBe('started');
  });

  it('POST returns 409 when one is already running', async () => {
    vi.mocked(startReportRefresh).mockResolvedValueOnce({ started: false, startedAt: 'x' });
    const res = buildRes();
    await handler(req('POST'), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.status).toBe('in_progress');
  });

  it('POST is blocked (429) when rate-limited, without starting a refresh', async () => {
    // The real enforceRateLimit sends the 429 itself and returns false; mimic that.
    vi.mocked(enforceRateLimit).mockImplementationOnce(async (_req, res) => {
      (res as unknown as { status: (c: number) => { json: (b: unknown) => void } })
        .status(429)
        .json({ error: 'rate limited' });
      return false;
    });
    const res = buildRes();
    await handler(req('POST'), res);
    // A 429 (not 202/409) is the observable proof the refresh wasn't triggered.
    expect(res.statusCode).toBe(429);
  });

  it('rejects other methods with 405', async () => {
    const res = buildRes();
    await handler(req('DELETE'), res);
    expect(res.statusCode).toBe(405);
  });
});
