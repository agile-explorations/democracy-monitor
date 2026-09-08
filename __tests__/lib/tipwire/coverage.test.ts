import { describe, expect, it } from 'vitest';
import { NICHE_MAX_HITS, isNationalOutlet } from '@/lib/data/coverage-outlets';
import { ROBOTS_REGISTRY } from '@/lib/data/robots-registry';
import {
  GDELT_MAX_KEYS_PER_TIP,
  GDELT_MIN_SPACING_MS,
  coverageLine,
  createCoverageChecker,
  gdeltUrl,
  isIdentifierGrade,
  labelCoverage,
  parseGdeltArtlist,
  selectKeys,
  summarizeHits,
} from '@/lib/tipwire/coverage';
import type { CoverageKeyResult } from '@/lib/tipwire/coverage';
import { ROSTER } from '@/lib/tipwire/roster';

const THROTTLE =
  'Please limit requests to one every 5 seconds or contact kalev.leetaru5@gmail.com for larger queries.';
const artlist = (urls: string[]) =>
  JSON.stringify({ articles: urls.map((url) => ({ url, title: 't' })) });

describe('coverage — pure pieces (#865)', () => {
  it('builds a quoted artlist query over the window', () => {
    const u = gdeltUrl('Executive Order 14410', 30);
    expect(u.startsWith('https://api.gdeltproject.org/api/v2/doc/doc?')).toBe(true);
    expect(u).toContain('query=%22Executive+Order+14410%22');
    expect(u).toContain('mode=artlist');
    expect(u).toContain('format=json');
    expect(u).toContain('timespan=30d');
    expect(gdeltUrl('say "hi"')).toContain('query=%22say+hi%22');
  });

  it('accepts identifier-grade keys and rejects paraphrasable phrases', () => {
    for (const ok of [
      'Executive Order 14410',
      '2026-18061',
      'Douglas v. Veterans Administration',
      'Schedule Policy/Career',
      'Advocates for Human Rights v. Bondi',
      'Liz Oyer',
    ])
      expect(isIdentifierGrade(ok), ok).toBe(true);
    for (const bad of [
      'workplace discrimination',
      'pay freeze',
      'the',
      'x'.repeat(81),
      'inspector general',
    ])
      expect(isIdentifierGrade(bad), bad).toBe(false);
    expect(
      selectKeys([
        'pay freeze',
        ' 2026-18061 ',
        '2026-18061',
        'Liz Oyer',
        'EO 14410',
        'MSPB 5 U.S.C. 7701',
      ]),
    ).toEqual(['2026-18061', 'Liz Oyer', 'EO 14410']);
    expect(GDELT_MAX_KEYS_PER_TIP).toBe(3);
  });

  it('parses an artlist, and returns null for the throttle text, non-JSON, and shapes without articles', () => {
    expect(parseGdeltArtlist(artlist(['https://a.com/x', 'https://b.org/y']))?.urls).toEqual([
      'https://a.com/x',
      'https://b.org/y',
    ]);
    expect(parseGdeltArtlist(JSON.stringify({ articles: [] }))?.urls).toEqual([]);
    expect(parseGdeltArtlist(THROTTLE)).toBeNull();
    expect(parseGdeltArtlist('<html>429</html>')).toBeNull();
    expect(parseGdeltArtlist(JSON.stringify({ timeline: [] }))).toBeNull();
    expect(parseGdeltArtlist('null')).toBeNull();
  });

  it('drops the reporter’s own outlet from hits and samples at most three URLs', () => {
    const urls = [
      'https://www.govexec.com/a',
      'https://news.local/1',
      'https://news.local/2',
      'https://news.local/3',
      'https://news.local/4',
    ];
    expect(summarizeHits(urls, 'govexec.com')).toEqual({
      hits: 4,
      sampleUrls: ['https://news.local/1', 'https://news.local/2', 'https://news.local/3'],
    });
    expect(summarizeHits(urls).hits).toBe(5);
    expect(summarizeHits(['not a url']).hits).toBe(0);
  });

  it('labels: zero → checkable-zero; few regional → niche; a national hit or many hits → likely-covered; failures without positives → not-checkable', () => {
    const k = (hits: number, sampleUrls: string[] = [], error?: string): CoverageKeyResult => ({
      key: 'k',
      hits,
      sampleUrls,
      error,
    });
    expect(labelCoverage([k(0)])).toBe('checkable-zero');
    expect(labelCoverage([k(2, ['https://www.usbordernews.com/x'])])).toBe('niche');
    expect(labelCoverage([k(NICHE_MAX_HITS + 1, ['https://www.usbordernews.com/x'])])).toBe(
      'likely-covered',
    );
    expect(labelCoverage([k(1, ['https://www.nytimes.com/2026/09/x.html'])])).toBe(
      'likely-covered',
    );
    expect(labelCoverage([k(0, [], 'throttled')])).toBe('not-checkable');
    expect(labelCoverage([k(0), k(0, [], 'throttled')])).toBe('not-checkable');
    expect(labelCoverage([k(2, ['https://news.local/1']), k(0, [], 'throttled')])).toBe('niche');
    expect(labelCoverage([])).toBe('not-checkable');
    expect(isNationalOutlet('www.washingtonpost.com')).toBe(true);
    expect(isNationalOutlet('notwashingtonpost.com')).toBe(false);
  });

  it('renders the graded digest line with URLs and the not-yet-checked fallback', () => {
    expect(coverageLine(null)).toEqual(['Coverage: not yet checked']);
    const lines = coverageLine({
      checkedAt: '2026-09-08T00:00:00Z',
      windowDays: 30,
      keys: [
        {
          key: '2026-18061',
          hits: 2,
          sampleUrls: ['https://news.local/1', 'https://news.local/2'],
        },
        { key: 'Liz Oyer', hits: 0, sampleUrls: [], error: 'throttled or invalid response' },
      ],
      label: 'niche',
    });
    expect(lines[0]).toBe('Coverage: 2 hit(s) in 30d, all niche — see URLs');
    expect(lines).toContain('  · "2026-18061": https://news.local/1');
    expect(lines).toContain('  · "Liz Oyer": throttled or invalid response');
    expect(
      coverageLine({ checkedAt: '', windowDays: 30, keys: [], label: 'not-checkable' })[0],
    ).toContain('not checkable');
  });
});

describe('coverage — registry and roster paperwork (#865)', () => {
  it('registers the GDELT DOC API as an api host and gives every reporter an outlet domain', () => {
    const entry = ROBOTS_REGISTRY.find((e) => e.host === 'api.gdeltproject.org');
    expect(entry).toMatchObject({ kind: 'api', status: 'active' });
    expect(entry?.paths).toContain('/api/v2/doc/doc');
    for (const r of ROSTER) expect(r.outletDomain, r.id).toMatch(/^[a-z0-9.-]+\.[a-z]+$/);
  });
});

describe('coverage checker — injected deps (#865)', () => {
  function harness(bodies: Record<string, string | Error>, maxCalls = 30) {
    const calls: string[] = [];
    const waits: number[] = [];
    let clock = 1_000_000;
    const checker = createCoverageChecker({
      fetchText: async (url) => {
        calls.push(url);
        const key = decodeURIComponent(new URL(url).searchParams.get('query') ?? '').replace(
          /"/g,
          '',
        );
        const b = bodies[key];
        if (b instanceof Error) throw b;
        return b ?? THROTTLE;
      },
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      now: () => clock,
      maxCalls,
    });
    return { checker, calls, waits };
  }

  it('queries only identifier-grade keys, serializes them ≥ spacing apart, and drops own-outlet hits', async () => {
    const h = harness({
      '2026-18061': artlist(['https://www.govexec.com/mine', 'https://news.local/1']),
      'Liz Oyer': artlist(['https://www.nytimes.com/x']),
    });
    const c = await h.checker(['pay freeze', '2026-18061', 'Liz Oyer'], 'govexec.com');
    expect(h.calls).toHaveLength(2);
    expect(h.waits).toEqual([GDELT_MIN_SPACING_MS]);
    expect(c.keys).toEqual([
      { key: '2026-18061', hits: 1, sampleUrls: ['https://news.local/1'] },
      { key: 'Liz Oyer', hits: 1, sampleUrls: ['https://www.nytimes.com/x'] },
    ]);
    expect(c.label).toBe('likely-covered');
    expect(c.windowDays).toBe(30);
  });

  it('makes no call and reports not-checkable when no key is identifier-grade', async () => {
    const h = harness({});
    const c = await h.checker(['pay freeze', 'unions']);
    expect(h.calls).toHaveLength(0);
    expect(c).toMatchObject({ keys: [], label: 'not-checkable' });
  });

  it('never turns a throttle, a thrown fetch, or the run cap into a zero', async () => {
    const h = harness({ '2026-18061': THROTTLE, 'Liz Oyer': new Error('timeout') }, 30);
    const c = await h.checker(['2026-18061', 'Liz Oyer']);
    expect(c.keys.map((k) => k.error)).toEqual(['throttled or invalid response', 'timeout']);
    expect(c.label).toBe('not-checkable');

    const capped = harness({ '2026-18061': artlist([]), 'Liz Oyer': artlist([]) }, 1);
    const c2 = await capped.checker(['2026-18061', 'Liz Oyer']);
    expect(capped.calls).toHaveLength(1);
    expect(c2.keys[1]).toMatchObject({ error: 'run cap reached' });
    expect(c2.label).toBe('not-checkable');

    const clean = harness({ '2026-18061': artlist([]) });
    expect((await clean.checker(['2026-18061'])).label).toBe('checkable-zero');
  });

  it('shares the spacing clock and the cap across tips within one run', async () => {
    const h = harness(
      { '2026-18061': artlist([]), 'EO 14410': artlist([]), 'Liz Oyer': artlist([]) },
      2,
    );
    await h.checker(['2026-18061']);
    const second = await h.checker(['EO 14410', 'Liz Oyer']);
    expect(h.calls).toHaveLength(2);
    expect(h.waits).toEqual([GDELT_MIN_SPACING_MS]);
    expect(second.keys[1].error).toBe('run cap reached');
  });
});
