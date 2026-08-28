import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheGet, cacheSet, rateLimitHit } from '@/lib/cache';
import { sendOpsAlert } from '@/lib/services/ops-alert-service';
import {
  admitSpend,
  BUILD_ALERT_PER_HOUR,
  crossedLevel,
  dayStamp,
  evaluateBudget,
  hourStamp,
  readBudgetStatus,
  secondsToNextDay,
  SPEND_LIMITS,
} from '@/lib/services/search-spend-budget';

vi.mock('@/lib/cache', () => ({ cacheGet: vi.fn(), cacheSet: vi.fn(), rateLimitHit: vi.fn() }));
vi.mock('@/lib/services/ops-alert-service', () => ({ sendOpsAlert: vi.fn(async () => true) }));

const store = new Map<string, unknown>();
const counters = new Map<string, number>();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  store.clear();
  counters.clear();
  vi.mocked(sendOpsAlert).mockClear();
  vi.mocked(cacheGet).mockImplementation(
    async (key: string) => (store.has(key) ? store.get(key) : counters.get(key)) ?? null,
  );
  vi.mocked(cacheSet).mockImplementation(async (key: string, value: unknown) => {
    store.set(key, value);
  });
  vi.mocked(rateLimitHit).mockImplementation(async (key: string) => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  });
});
afterEach(() => {
  delete process.env.SEARCH_SPEND_BUDGET;
});

describe('spend budget (#794) — pure parts', () => {
  it('stamps UTC windows and computes the retry to the day roll', () => {
    const t = new Date('2026-08-27T23:30:00Z');
    expect(dayStamp(t)).toBe('2026-08-27');
    expect(hourStamp(t)).toBe('2026-08-27T23');
    expect(secondsToNextDay(t)).toBe(1800);
  });

  it('evaluates global before source', () => {
    const limits = { source: 2, global: 5 };
    expect(evaluateBudget({ source: 1, global: 1 }, limits)).toEqual({ ok: true });
    expect(evaluateBudget({ source: 3, global: 1 }, limits)).toMatchObject({
      code: 'daily_budget',
    });
    expect(evaluateBudget({ source: 3, global: 6 }, limits)).toMatchObject({
      code: 'search_paused',
    });
  });

  it('names the level exactly when a count crosses it', () => {
    expect(crossedLevel(5, 10)).toBe('50%');
    expect(crossedLevel(10, 10)).toBe('100%');
    expect(crossedLevel(6, 10)).toBeNull();
  });
});

describe('spend budget (#794) — admission and alerts', () => {
  it('counts per source and globally, and pauses only that source past its budget', async () => {
    const limit = SPEND_LIMITS.source.build;
    for (let i = 0; i < limit; i++) expect((await admitSpend('build', 'pass:a')).ok).toBe(true);
    expect(await admitSpend('build', 'pass:a')).toMatchObject({ ok: false, code: 'daily_budget' });
    expect((await admitSpend('build', 'pass:b')).ok).toBe(true);
  });

  it('pauses globally past the global limit, alerting once at 50% and once at 100%', async () => {
    const limit = SPEND_LIMITS.global.stream;
    for (let i = 0; i < limit; i++) await admitSpend('stream', `pass:${i}`); // distinct sources
    await flush();
    const subjects = vi.mocked(sendOpsAlert).mock.calls.map((c) => c[0]);
    expect(subjects.filter((s) => s.includes('50%'))).toHaveLength(1);
    expect(subjects.filter((s) => s.includes('100%'))).toHaveLength(1);
    expect(await admitSpend('stream', 'pass:new')).toMatchObject({
      ok: false,
      code: 'search_paused',
    });
    const status = await readBudgetStatus();
    expect(status.paused.stream).toBe(true);
    expect(status.stream.count).toBe(limit + 1);
  });

  it('keeps counting but never rejects when the budget is switched off', async () => {
    process.env.SEARCH_SPEND_BUDGET = 'off';
    for (let i = 0; i <= SPEND_LIMITS.source.build; i++)
      expect((await admitSpend('build', 'pass:a')).ok).toBe(true);
  });

  it('yields when Redis is unavailable (backstop, not outage)', async () => {
    vi.mocked(rateLimitHit).mockResolvedValue(null);
    expect((await admitSpend('build', 'pass:a')).ok).toBe(true);
  });

  it('alerts once on a novel-build spike within the hour', async () => {
    for (let i = 0; i < BUILD_ALERT_PER_HOUR + 5; i++) await admitSpend('build', `pass:${i % 7}`);
    await flush();
    const spikes = vi
      .mocked(sendOpsAlert)
      .mock.calls.filter((c) => c[0].includes('novel builds this hour'));
    expect(spikes).toHaveLength(1);
  });
});
