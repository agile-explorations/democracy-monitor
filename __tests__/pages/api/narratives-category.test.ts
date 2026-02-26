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

describe('GET /api/narratives/[category]', () => {
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
      buildStableTemplate: vi.fn(),
      generateCategoryNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/[category]');
    const req = {
      method: 'POST',
      query: { category: 'civilService', weekOf: '2026-02-17' },
    } as unknown as NextApiRequest;
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
      buildStableTemplate: vi.fn(),
      generateCategoryNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/[category]');
    const req = {
      method: 'GET',
      query: { category: 'civilService', weekOf: '2026-02-17' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it('returns 404 for unknown category', async () => {
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
      buildStableTemplate: vi.fn(),
      generateCategoryNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/[category]');
    const req = {
      method: 'GET',
      query: { category: 'nonexistent', weekOf: '2026-02-17' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when weekOf is missing', async () => {
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
      buildStableTemplate: vi.fn(),
      generateCategoryNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/[category]');
    const req = {
      method: 'GET',
      query: { category: 'civilService' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Missing required query parameter: weekOf' });
  });

  it('returns 400 for invalid version parameter', async () => {
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
      buildStableTemplate: vi.fn(),
      generateCategoryNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/[category]');
    const req = {
      method: 'GET',
      query: { category: 'civilService', weekOf: '2026-02-17', version: 'invalid' },
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
        expert: { content: 'Expert content', model: 'claude-opus-4-6' },
        public: { content: 'Public content', model: 'claude-opus-4-6' },
      }),
      storeNarratives: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-generation-service', () => ({
      isElevatedStatus: vi.fn(),
      buildStableTemplate: vi.fn(),
      generateCategoryNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/[category]');
    const req = {
      method: 'GET',
      query: { category: 'civilService', weekOf: '2026-02-17' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ expert: 'Expert content', public: 'Public content' });
    expect(res.headers['Cache-Control']).toContain('s-maxage=3600');
  });

  it('returns only requested version when specified', async () => {
    vi.doMock('@/lib/db', () => ({
      isDbAvailable: () => true,
      getDb: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-store', () => ({
      getStoredNarratives: vi.fn().mockResolvedValue({
        expert: { content: 'Expert only', model: 'claude-opus-4-6' },
        public: { content: 'Public only', model: 'claude-opus-4-6' },
      }),
      storeNarratives: vi.fn(),
    }));
    vi.doMock('@/lib/services/narrative-generation-service', () => ({
      isElevatedStatus: vi.fn(),
      buildStableTemplate: vi.fn(),
      generateCategoryNarrative: vi.fn(),
    }));

    const { default: handler } = await import('@/pages/api/narratives/[category]');
    const req = {
      method: 'GET',
      query: { category: 'civilService', weekOf: '2026-02-17', version: 'expert' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ expert: 'Expert only' });
  });
});
