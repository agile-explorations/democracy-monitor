import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

vi.mock('@/lib/utils/async', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchWithRetry', () => {
  it('returns response on first successful attempt', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const response = await fetchWithRetry('https://example.com');

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 503 then succeeds on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const response = await fetchWithRetry('https://example.com', undefined, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      label: 'test_signal',
    });

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on network error then succeeds', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const response = await fetchWithRetry('https://example.com', undefined, {
      maxAttempts: 3,
      baseDelayMs: 500,
    });

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 404 (client error)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const response = await fetchWithRetry('https://example.com');

    expect(response.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 (rate limit)', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const response = await fetchWithRetry('https://example.com', undefined, {
      maxAttempts: 2,
      baseDelayMs: 1000,
    });

    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns final error response after all attempts exhausted', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 502 });

    const response = await fetchWithRetry('https://example.com', undefined, {
      maxAttempts: 3,
      baseDelayMs: 100,
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('throws after all attempts exhausted on persistent network error', async () => {
    const error = new TypeError('DNS resolution failed');
    mockFetch.mockRejectedValue(error);

    await expect(
      fetchWithRetry('https://example.com', undefined, {
        maxAttempts: 3,
        baseDelayMs: 100,
      }),
    ).rejects.toThrow('DNS resolution failed');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff delays', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await fetchWithRetry('https://example.com', undefined, {
      maxAttempts: 3,
      baseDelayMs: 2000,
    });

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000); // 2000 * 2^0
    expect(sleep).toHaveBeenNthCalledWith(2, 4000); // 2000 * 2^1
  });

  it('passes init options through to fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const init = {
      headers: { 'User-Agent': 'TestBot/1.0' },
    };
    await fetchWithRetry('https://example.com/api', init);

    // nosemgrep: opengrep.no-mock-call-assertions — init passthrough is the behavior under test; return value can't prove forwarding
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', init);
  });
});
