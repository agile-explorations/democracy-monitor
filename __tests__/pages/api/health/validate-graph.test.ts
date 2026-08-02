import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runLiveInvariants } from '@/lib/cron/validate-graph';
import handler from '@/pages/api/health/validate-graph';

const { store } = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn(async (k: string) => store[k] ?? null),
  cacheSet: vi.fn(async (k: string, v: unknown) => {
    store[k] = v;
  }),
}));
vi.mock('@/lib/db', () => ({ isDbAvailable: vi.fn(() => true) }));
vi.mock('@/lib/cron/validate-graph', () => ({
  runLiveInvariants: vi.fn(async () => [
    { id: 'G4h', severity: 'warn', description: 'live', violations: 0, pass: true },
  ]),
  runGraphValidation: vi.fn(async () => [
    { id: 'G1a', severity: 'error', description: 'heavy', violations: 0, pass: true },
  ]),
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
function buildReq(query: Record<string, string> = {}): NextApiRequest {
  return { method: 'GET', query, headers: {} } as unknown as NextApiRequest;
}

describe('GET /api/health/validate-graph (#650)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(store)) delete store[k];
  });

  it('runs live invariants and returns them when no heavy report is stored', async () => {
    const res = buildRes();
    await handler(buildReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.live).toBe(true);
    expect(res.body.pending).toBe(true);
    expect(res.body.results.map((r: any) => r.id)).toContain('G4h');
  });

  it('merges the fresh live invariants over the cached heavy report', async () => {
    store['health:validate-graph:v1'] = {
      results: [
        { id: 'G1a', severity: 'error', description: 'heavy', violations: 0, pass: true },
        { id: 'G4h', severity: 'warn', description: 'STALE', violations: 9, pass: false },
      ],
      generatedAt: '2026-01-01T00:00:00.000Z',
    };
    const res = buildRes();
    await handler(buildReq(), res);
    const byId = Object.fromEntries(res.body.results.map((r: any) => [r.id, r]));
    expect(byId.G1a).toBeTruthy(); // heavy invariant kept
    expect(byId.G4h.violations).toBe(0); // live replaced the stale G4h
    expect(res.body.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(res.body.live).toBe(true);
  });

  it('serves the live cache on a second call (no DB re-run within TTL)', async () => {
    await handler(buildReq(), buildRes());
    await handler(buildReq(), buildRes());
    expect(vi.mocked(runLiveInvariants)).toHaveBeenCalledTimes(1);
  });

  it('?fresh=1 runs the full validation and caches it', async () => {
    const { runGraphValidation } = await import('@/lib/cron/validate-graph');
    const res = buildRes();
    await handler(buildReq({ fresh: '1' }), res);
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(runGraphValidation)).toHaveBeenCalledOnce();
    expect(res.body.results.map((r: any) => r.id)).toContain('G1a');
    expect(res.body.generatedAt).toBeTruthy();
  });
});
