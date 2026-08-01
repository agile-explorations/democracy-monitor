import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getRefreshStatus, startReportRefresh } from '@/lib/services/report-refresh';

const { store } = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock('@/lib/cache', () => ({
  cacheGet: vi.fn(async (k: string) => store[k] ?? null),
  cacheSet: vi.fn(async (k: string, v: unknown) => {
    store[k] = v;
  }),
}));
vi.mock('@/lib/cron/snapshot-poststeps', () => ({
  tryValidateGraph: vi.fn(async () => {}),
  tryStoreDataReport: vi.fn(async () => {}),
}));

const LOCK_KEY = 'health:report-refresh:status';

describe('report-refresh (#650 follow-up)', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('reports not in-flight when no lock exists', async () => {
    expect(await getRefreshStatus()).toEqual({ inFlight: false, startedAt: null });
  });

  it('starts a refresh when idle', async () => {
    const r = await startReportRefresh();
    expect(r.started).toBe(true);
    expect(typeof r.startedAt).toBe('string');
  });

  it('coalesces — will not start a second run while one is running', async () => {
    store[LOCK_KEY] = { status: 'running', startedAt: '2026-01-01T00:00:00.000Z' };
    const r = await startReportRefresh();
    expect(r.started).toBe(false);
    expect(r.startedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(await getRefreshStatus()).toEqual({
      inFlight: true,
      startedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('a finished (done) lock reads as not in-flight', async () => {
    store[LOCK_KEY] = { status: 'done', startedAt: 'x', finishedAt: 'y' };
    expect(await getRefreshStatus()).toEqual({ inFlight: false, startedAt: null });
  });
});
