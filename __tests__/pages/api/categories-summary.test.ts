import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
  };
  return res as unknown as NextApiResponse & {
    statusCode: number;
    body: unknown;
  };
}

describe('GET /api/categories/summary', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 405 for non-GET requests', async () => {
    const { default: handler } = await import('@/pages/api/categories/summary');
    const req = { method: 'POST' } as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns fallback data when DB is unavailable', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => false,
      getDb: () => {
        throw new Error('no db');
      },
    }));

    const { default: handler } = await import('@/pages/api/categories/summary');
    const req = { method: 'GET' } as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const data = res.body as Array<Record<string, unknown>>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(13);
    expect(data[0]).toHaveProperty('category');
    expect(data[0]).toHaveProperty('title');
    expect(data[0]).toHaveProperty('status', 'Stable');
    expect(data[0]).toHaveProperty('sparklineData');
    expect(data[0].sparklineData).toEqual([]);
  });
});
