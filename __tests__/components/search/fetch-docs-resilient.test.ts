import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchDocsResilient } from '@/components/search/helpers';

afterEach(() => vi.unstubAllGlobals());

function controller() {
  return new AbortController();
}

describe('fetchDocsResilient (#729)', () => {
  it('returns a 200 immediately', async () => {
    const ok = new Response('{}', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok));
    const res = await fetchDocsResilient('/api/search?x', controller().signal);
    expect(res.status).toBe(200);
  });

  it('retries after a network cut and returns the cached 200', async () => {
    const ok = new Response('{}', { status: 200 });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network error')) // edge cut
      .mockResolvedValueOnce(ok);
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchDocsResilient('/api/search?x', controller().signal, {
      retryDelayMs: 5,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('wait-polls on 202 until the build completes', async () => {
    const building = () =>
      new Response(JSON.stringify({ status: 'building', retryAfterMs: 5 }), { status: 202 });
    const ok = new Response('{}', { status: 200 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(building())
      .mockResolvedValueOnce(building())
      .mockResolvedValueOnce(ok);
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchDocsResilient('/api/search?x', controller().signal);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns real error statuses to the caller without retrying', async () => {
    const err = new Response('{"error":"boom"}', { status: 500 });
    const fetchMock = vi.fn().mockResolvedValue(err);
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchDocsResilient('/api/search?x', controller().signal);
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates user aborts', async () => {
    const ctrl = controller();
    const fetchMock = vi.fn().mockImplementation(() => {
      ctrl.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchDocsResilient('/api/search?x', ctrl.signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the total budget', async () => {
    const building = () =>
      new Response(JSON.stringify({ status: 'building', retryAfterMs: 5 }), { status: 202 });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(building())),
    );
    await expect(
      fetchDocsResilient('/api/search?x', controller().signal, { maxTotalMs: 30, retryDelayMs: 5 }),
    ).rejects.toThrow(/unusually long/);
  });
});
