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
      return res;
    },
  };
  return res as unknown as NextApiResponse & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  };
}

describe('GET /api/narratives/overview', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 405 for non-GET requests', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => true,
      getDb: () => {
        throw new Error('no db');
      },
    }));
    vi.doMock('@/lib/services/narrative-store', () => ({
      getStoredNarratives: vi.fn(),
      storeNarratives: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-generation-service', () => ({
      isElevatedStatus: vi.fn(),
      generateOverviewNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/overview');
    const req = { method: 'POST', query: { weekOf: '2026-02-17' } } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 503 when DB is unavailable', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => false,
      getDb: () => {
        throw new Error('no db');
      },
    }));
    vi.doMock('@/lib/services/narrative-store', () => ({
      getStoredNarratives: vi.fn(),
      storeNarratives: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-generation-service', () => ({
      isElevatedStatus: vi.fn(),
      generateOverviewNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/overview');
    const req = {
      method: 'GET',
      query: { weekOf: '2026-02-17' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it('returns 400 when weekOf is missing', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => true,
      getDb: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-store', () => ({
      getStoredNarratives: vi.fn(),
      storeNarratives: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-generation-service', () => ({
      isElevatedStatus: vi.fn(),
      generateOverviewNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/overview');
    const req = { method: 'GET', query: {} } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing required query parameter: weekOf' });
  });

  it('returns 400 for invalid version', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => true,
      getDb: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-store', () => ({
      getStoredNarratives: vi.fn(),
      storeNarratives: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-generation-service', () => ({
      isElevatedStatus: vi.fn(),
      generateOverviewNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/overview');
    const req = {
      method: 'GET',
      query: { weekOf: '2026-02-17', version: 'bad' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns stored narrative when available', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => true,
      getDb: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-store', () => ({
      getStoredNarratives: vi.fn().mockResolvedValue({
        expert: { content: 'Overview expert' },
        public: { content: 'Overview public' },
      }),
      storeNarratives: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-generation-service', () => ({
      isElevatedStatus: vi.fn(),
      generateOverviewNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/overview');
    const req = {
      method: 'GET',
      query: { weekOf: '2026-02-17' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ expert: 'Overview expert', public: 'Overview public' });
    expect(res.headers['Cache-Control']).toContain('s-maxage=3600');
  });

  it('returns only expert version when requested', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => true,
      getDb: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-store', () => ({
      getStoredNarratives: vi.fn().mockResolvedValue({
        expert: { content: 'Expert only' },
        public: { content: 'Public only' },
      }),
      storeNarratives: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-generation-service', () => ({
      isElevatedStatus: vi.fn(),
      generateOverviewNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/overview');
    const req = {
      method: 'GET',
      query: { weekOf: '2026-02-17', version: 'expert' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ expert: 'Expert only' });
  });
});
