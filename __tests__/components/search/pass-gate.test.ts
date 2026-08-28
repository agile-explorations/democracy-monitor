import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensurePass,
  isPassRequired,
  PASS_FRESH_MS,
  passIsFresh,
  resetPassMemory,
} from '@/components/search/pass-gate';

vi.mock('@/lib/hooks/useTurnstile', () => ({ getTurnstileToken: vi.fn(async () => 'tok') }));

const res = (status: number, body: unknown) =>
  ({ status, clone: () => ({ json: async () => body }) }) as unknown as Pick<
    Response,
    'status' | 'clone'
  >;

afterEach(() => {
  resetPassMemory();
  vi.unstubAllGlobals();
});

describe('pass gate (#792)', () => {
  it('passIsFresh honors the refresh window', () => {
    expect(passIsFresh(0, 1000)).toBe(false);
    expect(passIsFresh(1000, 1000 + PASS_FRESH_MS - 1)).toBe(true);
    expect(passIsFresh(1000, 1000 + PASS_FRESH_MS)).toBe(false);
  });

  it('recognizes only the 403 pass_required response', async () => {
    expect(await isPassRequired(res(403, { code: 'pass_required' }))).toBe(true);
    expect(await isPassRequired(res(403, { error: 'other' }))).toBe(false);
    expect(await isPassRequired(res(200, { code: 'pass_required' }))).toBe(false);
  });

  it('exchanges a token for a pass once, then reuses it while fresh, reporting the wait', async () => {
    const fetchMock = vi.fn(async () => ({ status: 204, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    const waits: boolean[] = [];
    await ensurePass(false, { onWaiting: (w) => waits.push(w) });
    await ensurePass();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([true, false]);
    await ensurePass(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a failed exchange as an error and does not remember it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 400, json: async () => ({ error: 'Bot check failed' }) })),
    );
    await expect(ensurePass()).rejects.toThrow('Bot check failed');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 204, json: async () => ({}) })),
    );
    await ensurePass();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
