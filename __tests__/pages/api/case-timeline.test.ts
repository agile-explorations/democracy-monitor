import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockRes() {
  const res: any = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
  return res as NextApiResponse & {
    statusCode: number;
    body: any;
    headers: Record<string, string>;
  };
}

const timelinePayload = {
  caseId: 'cl:123',
  docketUrl: 'https://www.courtlistener.com/docket/123/',
  asOf: '2026-08-09T00:00:00Z',
  entries: [],
  posture: null,
  truncated: false,
};

describe('/api/case/timeline', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/lib/utils/rate-limit', () => ({
      enforceRateLimit: vi.fn().mockResolvedValue(true),
      RATE_LIMITS: { caseTimeline: { windowMs: 60_000, maxRequests: 30, keyPrefix: 'rl:case' } },
    }));
  });

  it('rejects non-GET with 405', async () => {
    vi.doMock('@/lib/cache', () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
    const { default: handler } = await import('@/pages/api/case/timeline');
    const res = createMockRes();
    await handler({ method: 'POST', query: {} } as unknown as NextApiRequest, res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects invalid caseId with 400', async () => {
    vi.doMock('@/lib/cache', () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
    const { default: handler } = await import('@/pages/api/case/timeline');
    const res = createMockRes();
    await handler({ method: 'GET', query: { caseId: 'cl:12a' } } as unknown as NextApiRequest, res);
    expect(res.statusCode).toBe(400);
  });

  it('serves the cached payload without fetching CL', async () => {
    const cacheGet = vi.fn().mockResolvedValue(timelinePayload);
    const fetchDocketEntries = vi.fn();
    vi.doMock('@/lib/cache', () => ({ cacheGet, cacheSet: vi.fn() }));
    vi.doMock('@/lib/services/docket-timeline', async (importOriginal) => ({
      ...(await importOriginal<object>()),
      fetchDocketEntries,
    }));
    const { default: handler } = await import('@/pages/api/case/timeline');
    const res = createMockRes();
    await handler({ method: 'GET', query: { caseId: 'cl:123' } } as unknown as NextApiRequest, res);
    expect(res.statusCode).toBe(200);
    // The cached asOf survives — proof the payload came from cache, not a fresh CL build.
    expect(res.body.asOf).toBe('2026-08-09T00:00:00Z');
    expect(res.headers['Cache-Control']).toContain('s-maxage=3600');
  });

  it('returns 502 on CL failure and a later request retries successfully (failure not cached)', async () => {
    // Real cache behavior via an in-memory map — proves the failure never lands in cache.
    const store = new Map<string, unknown>();
    vi.doMock('@/lib/cache', () => ({
      cacheGet: vi.fn(async (k: string) => store.get(k) ?? null),
      cacheSet: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
    }));
    const fetchDocketEntries = vi
      .fn()
      .mockRejectedValueOnce(new Error('CL 503'))
      .mockResolvedValueOnce({ results: [], hasMore: false });
    vi.doMock('@/lib/services/docket-timeline', async (importOriginal) => ({
      ...(await importOriginal<object>()),
      fetchDocketEntries,
    }));
    const { default: handler } = await import('@/pages/api/case/timeline');
    const first = createMockRes();
    await handler(
      { method: 'GET', query: { caseId: 'cl:123' } } as unknown as NextApiRequest,
      first,
    );
    expect(first.statusCode).toBe(502);
    const second = createMockRes();
    await handler(
      { method: 'GET', query: { caseId: 'cl:123' } } as unknown as NextApiRequest,
      second,
    );
    expect(second.statusCode).toBe(200);
    expect(second.body.caseId).toBe('cl:123');
  });
});
