import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as NextApiResponse & {
    statusCode: number;
    body: unknown;
  };
}

describe('GET /api/category/[key]', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 405 for non-GET requests', async () => {
    const { default: handler } = await import('@/pages/api/category/[key]');
    const req = {
      method: 'POST',
      query: { key: 'judicialIndependence' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 404 for unknown category', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => true,
      getDb: () => {
        throw new Error('no db');
      },
    }));

    const { default: handler } = await import('@/pages/api/category/[key]');
    const req = { method: 'GET', query: { key: 'nonexistent' } } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns fallback data when DB is unavailable', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => false,
      getDb: () => {
        throw new Error('no db');
      },
    }));

    const { default: handler } = await import('@/pages/api/category/[key]');
    const req = {
      method: 'GET',
      query: { key: 'judicialIndependence' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const data = res.body as Record<string, unknown>;
    expect(data.category).toBe('judicialIndependence');
    expect(data.title).toBe('Following Court Orders');
    expect(data.assessment).toBeNull();
    expect(data.baseline).toEqual({ avg: 0, stddev: 0 });
  });
});
