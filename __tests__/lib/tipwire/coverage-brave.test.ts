import { describe, expect, it } from 'vitest';
import { createCoverageRun } from '@/lib/tipwire/coverage';
import {
  BRAVE_API_KEY_ENV,
  braveFreshness,
  createBraveProvider,
} from '@/lib/tipwire/coverage-brave';

const NOW = Date.UTC(2026, 8, 24, 17, 0, 0); // 2026-09-24T17:00:00Z
const brave = createBraveProvider({ [BRAVE_API_KEY_ENV]: 'test-token' });
const results = (...urls: string[]) => ({
  results: urls.map((url) => ({ url, title: 't', description: 'd' })),
});
const hit = (url: string) => ({ url, title: 't', description: 'd' });

describe('Brave Search coverage provider (#920)', () => {
  it('is configured only by a non-blank key', () => {
    expect(brave.isConfigured()).toBe(true);
    expect(createBraveProvider({}).isConfigured()).toBe(false);
    expect(createBraveProvider({ [BRAVE_API_KEY_ENV]: '  ' }).isConfigured()).toBe(false);
    expect(brave).toMatchObject({ name: 'brave', minSpacingMs: 1_100, costPerCallUsd: 0.005 });
  });

  it('builds a US/English, spellcheck-off web query from the shaped key, with the key in a header, not the URL', () => {
    const { url, headers } = brave.buildRequest('"Executive Order 14410"', 30, NOW);
    expect(url.startsWith('https://api.search.brave.com/res/v1/web/search?')).toBe(true);
    expect(url).toContain('q=%22Executive+Order+14410%22');
    expect(url).toContain('count=20');
    expect(url).toContain('country=us');
    expect(url).toContain('search_lang=en');
    expect(url).toContain('freshness=pm');
    expect(url).toContain('result_filter=web%2Cnews');
    expect(url).toContain('spellcheck=false');
    expect(url).not.toContain('test-token');
    expect(headers).toEqual({ Accept: 'application/json', 'X-Subscription-Token': 'test-token' });
    expect(brave.buildRequest('DHS whistleblower retaliation', 7, NOW).url).toContain(
      'q=DHS+whistleblower+retaliation&',
    );
    expect(brave.buildRequest('x', 7, NOW).url).toContain('freshness=pw');
  });

  it('maps the window to a freshness token, or to an explicit date range when none fits', () => {
    expect(braveFreshness(1, NOW)).toBe('pd');
    expect(braveFreshness(7, NOW)).toBe('pw');
    expect(braveFreshness(30, NOW)).toBe('pm');
    expect(braveFreshness(365, NOW)).toBe('py');
    expect(braveFreshness(10, NOW)).toBe('2026-09-14to2026-09-24');
  });

  it('reads news then web URLs from a 2xx body and treats a body without a web key as zero results', () => {
    const body = JSON.stringify({
      type: 'search',
      news: results('https://thehill.com/a'),
      web: results('https://www.pogo.org/b', 'https://thehill.com/a'),
    });
    expect(brave.parse(200, body)).toEqual({
      results: [
        hit('https://thehill.com/a'),
        hit('https://www.pogo.org/b'),
        hit('https://thehill.com/a'),
      ],
    });
    expect(brave.parse(200, JSON.stringify({ type: 'search', query: { original: 'x' } }))).toEqual({
      results: [],
    });
    expect(
      brave.parse(
        200,
        JSON.stringify({ web: { results: [{ title: 'no url' }, 7, { url: 'https://a/b' }] } }),
      ),
    ).toEqual({ results: [{ url: 'https://a/b', title: undefined, description: undefined }] });
  });

  it('tells rate limit, auth, quota and bad requests apart from an empty answer', () => {
    expect(brave.parse(429, '{}')).toEqual({ error: 'rate limited' });
    expect(brave.parse(401, '')).toEqual({ error: 'auth rejected (401)' });
    expect(brave.parse(402, '')).toEqual({ error: 'quota exhausted (402)' });
    const envelope = JSON.stringify({
      type: 'ErrorResponse',
      error: { code: 'VALIDATION', detail: 'q too long', status: 422 },
    });
    expect(brave.parse(422, envelope)).toEqual({ error: 'invalid request: q too long' });
    expect(brave.parse(422, 'not json')).toEqual({ error: 'HTTP 422' });
    expect(brave.parse(500, '<html>')).toEqual({ error: 'HTTP 500' });
    expect(brave.parse(200, '<html>login</html>')).toEqual({ error: 'invalid response' });
    expect(brave.parse(200, 'null')).toEqual({ error: 'invalid response' });
  });

  it('runs through the checker: Brave spacing, provider stamp, and a 429 never becomes a zero', async () => {
    const bodies: Record<string, { status: number; text: string }> = {
      'GAO-26-108106': {
        status: 200,
        text: JSON.stringify({
          web: results(
            'https://www.gao.gov/products/gao-26-108106',
            'https://www.pogo.org/investigates/dhs',
            'https://thehill.com/dhs',
          ),
        }),
      },
      '39 of 73 cases': { status: 429, text: '{}' },
    };
    const waits: number[] = [];
    let clock = 5_000_000;
    const run = createCoverageRun({
      provider: brave,
      fetchResponse: async ({ url, headers }) => {
        expect(headers['X-Subscription-Token']).toBe('test-token');
        const key = decodeURIComponent(new URL(url).searchParams.get('q') ?? '').replace(/"/g, '');
        return bodies[key];
      },
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      now: () => clock,
    });
    const c = await run.check(['GAO-26-108106', '39 of 73 cases']);
    expect(run.calls()).toBe(2);
    expect(waits).toEqual([1_100]);
    expect(c.provider).toBe('brave');
    // gao.gov is the record itself, not coverage
    expect(c.keys[0]).toMatchObject({ kind: 'code', rawHits: 3, hits: 2, nationalHit: true });
    expect(c.keys[0].hitsByDomain).toEqual({
      'www.pogo.org': ['https://www.pogo.org/investigates/dhs'],
      'thehill.com': ['https://thehill.com/dhs'],
    });
    expect(c.keys[1]).toMatchObject({ hits: 0, error: 'rate limited' });
    expect(c.label).toBe('likely-covered');

    const allLimited = createCoverageRun({
      provider: brave,
      fetchResponse: async () => ({ status: 429, text: '{}' }),
      sleep: async () => undefined,
      now: () => clock,
    });
    expect((await allLimited.check(['GAO-26-108106'])).label).toBe('not-checkable');
  });
});
