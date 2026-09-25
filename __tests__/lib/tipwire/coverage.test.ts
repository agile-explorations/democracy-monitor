import { describe, expect, it } from 'vitest';
import {
  NICHE_MAX_HITS,
  isNationalOutlet,
  isNonCoverageHost,
  isPrimarySource,
} from '@/lib/data/coverage-outlets';
import { ROBOTS_REGISTRY } from '@/lib/data/robots-registry';
import type { TipCoverageCheck } from '@/lib/db/schema';
import {
  COVERAGE_MAX_KEYS_PER_TIP,
  createCoverageChecker,
  createCoverageRun,
  labelCoverage,
  probeCoverage,
  pruneCoverageUrls,
  selectKeys,
  selectProvider,
  summarizeHits,
} from '@/lib/tipwire/coverage';
import type { CoverageKeyResult } from '@/lib/tipwire/coverage';
import { GDELT_PROVIDER } from '@/lib/tipwire/coverage-gdelt';
import {
  COVERAGE_UNAVAILABLE_LINE,
  POWERED_BY_BRAVE_LINE,
  coverageLine,
} from '@/lib/tipwire/coverage-line';
import type { SearchProvider } from '@/lib/tipwire/coverage-provider';
import { ROSTER } from '@/lib/tipwire/roster';

const THROTTLE =
  'Please limit requests to one every 5 seconds or contact kalev.leetaru5@gmail.com for larger queries.';
const artlist = (urls: string[], title = 't') =>
  JSON.stringify({ articles: urls.map((url) => ({ url, title })) });

describe('coverage — pure pieces (#865)', () => {
  it('the GDELT provider builds an artlist query over the window from the shaped key and reads an artlist', () => {
    const { url, headers } = GDELT_PROVIDER.buildRequest('"Executive Order 14410"', 30);
    expect(url.startsWith('https://api.gdeltproject.org/api/v2/doc/doc?')).toBe(true);
    expect(url).toContain('query=%22Executive+Order+14410%22');
    expect(url).toContain('mode=artlist');
    expect(url).toContain('format=json');
    expect(url).toContain('timespan=30d');
    expect(headers).toEqual({ Accept: 'application/json' });
    expect(GDELT_PROVIDER.parse(200, artlist(['https://a.com/x', 'https://b.org/y']))).toEqual({
      results: [
        { url: 'https://a.com/x', title: 't' },
        { url: 'https://b.org/y', title: 't' },
      ],
    });
    expect(GDELT_PROVIDER.parse(200, JSON.stringify({ articles: [] }))).toEqual({ results: [] });
    for (const bad of [THROTTLE, '<html>429</html>', JSON.stringify({ timeline: [] }), 'null'])
      expect(GDELT_PROVIDER.parse(200, bad)).toEqual({ error: 'throttled or invalid response' });
    expect(GDELT_PROVIDER.parse(429, '<html>')).toEqual({ error: 'rate limited (429)' });
  });

  it('selects the keys a web index can answer, deduplicated and capped (#921, #925)', () => {
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
    expect(COVERAGE_MAX_KEYS_PER_TIP).toBe(3);
  });

  it('counts every hit — the reporter’s own outlet included (#874) — groups URLs by host, and samples at most three', () => {
    const urls = [
      'https://www.govexec.com/a',
      'https://news.local/1',
      'https://news.local/2',
      'https://news.local/3',
      'https://news.local/4',
    ];
    expect(summarizeHits(urls)).toEqual({
      hits: 5,
      sampleUrls: ['https://www.govexec.com/a', 'https://news.local/1', 'https://news.local/2'],
      nationalHit: true,
      hitsByDomain: {
        'www.govexec.com': ['https://www.govexec.com/a'],
        'news.local': urls.slice(1),
      },
    });
    // a national hit beyond the sample cap still counts
    expect(summarizeHits([...urls.slice(1), 'https://www.nytimes.com/late'])).toMatchObject({
      hits: 5,
      nationalHit: true,
    });
    expect(summarizeHits(urls.slice(1))).toMatchObject({ hits: 4, nationalHit: false });
    // the anchor article itself is never coverage of its own follow-up (query string ignored)
    expect(summarizeHits(urls, ['https://www.govexec.com/a?utm=x'])).toMatchObject({
      hits: 4,
      nationalHit: false,
      hitsByDomain: { 'news.local': urls.slice(1) },
    });
    expect(
      labelCoverage([
        { key: 'k', hits: 5, sampleUrls: ['https://news.local/1'], nationalHit: true },
      ]),
    ).toBe('likely-covered');
    expect(summarizeHits(['not a url']).hits).toBe(0);
  });

  it('drops the record’s own hosts, reference/social pages and duplicate spellings before counting (#921)', () => {
    const hits = summarizeHits([
      'https://www.gao.gov/products/gao-26-108106',
      'https://www.govinfo.gov/app/details/CREC-2026-09-14',
      'https://www.courtlistener.com/opinion/10974444/streever-v-mullin/',
      'https://en.wikipedia.org/wiki/Whistleblower',
      'https://www.linkedin.com/posts/x',
      'https://thehill.com/dhs-whistleblowers/',
      'https://thehill.com/dhs-whistleblowers/?utm_source=x',
      'https://www.pogo.org/investigates/dhs-whistleblowers',
    ]);
    expect(hits).toEqual({
      hits: 2,
      sampleUrls: [
        'https://thehill.com/dhs-whistleblowers/',
        'https://www.pogo.org/investigates/dhs-whistleblowers',
      ],
      nationalHit: true,
      hitsByDomain: {
        'thehill.com': ['https://thehill.com/dhs-whistleblowers/'],
        'www.pogo.org': ['https://www.pogo.org/investigates/dhs-whistleblowers'],
      },
    });
    for (const primary of [
      'www.federalregister.gov',
      'ecf.dcd.uscourts.gov',
      'www.defense.mil',
      'www.courtlistener.com',
      'law.justia.com',
      'supreme.justia.com',
      'about.usps.com',
    ])
      expect(isPrimarySource(primary), primary).toBe(true);
    expect(isPrimarySource('www.govexec.com')).toBe(false);
    expect(isPrimarySource('gov.uk')).toBe(false);
    expect(isNonCoverageHost('en.wikipedia.org')).toBe(true);
    expect(isNonCoverageHost('isso.columbia.edu')).toBe(true);
    expect(isNonCoverageHost('www.britannica.com')).toBe(true);
    expect(isNonCoverageHost('reason.com')).toBe(false);
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
    // zero on quoted code keys alone says nothing (#925); a phrase or caption zero is a real zero
    const code = { ...k(0), kind: 'code' as const };
    const phrase = { ...k(0), kind: 'phrase' as const };
    expect(labelCoverage([code])).toBe('not-checkable');
    expect(labelCoverage([code, phrase])).toBe('checkable-zero');
    expect(labelCoverage([{ ...k(2, ['https://news.local/1']), kind: 'code' as const }])).toBe(
      'niche',
    );
    expect(isNationalOutlet('www.washingtonpost.com')).toBe(true);
    expect(isNationalOutlet('notwashingtonpost.com')).toBe(false);
  });

  it('renders the graded digest line with URLs, the not-yet-checked fallback, and the hand-check wording when the provider was unavailable', () => {
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
    expect(lines).not.toContain(POWERED_BY_BRAVE_LINE);
    const codeOnly = coverageLine({
      checkedAt: '',
      windowDays: 30,
      keys: [
        {
          key: 'GAO-26-108106',
          kind: 'code',
          rawHits: 3,
          hits: 0,
          sampleUrls: [],
          hitsByDomain: {},
        },
      ],
      label: 'not-checkable',
    });
    expect(codeOnly).toEqual([
      COVERAGE_UNAVAILABLE_LINE,
      '  · "GAO-26-108106": 0 exact matches — coverage rarely prints report or docket numbers',
    ]);
    const down = coverageLine({ checkedAt: '', windowDays: 30, keys: [], label: 'not-checkable' }, [
      { name: 'NOTUS', domain: 'notus.org' },
    ]);
    expect(down).toEqual([COVERAGE_UNAVAILABLE_LINE]);
    expect(down[0]).toContain('search the outlet before sending');
  });

  it('splits own-outlet hits from others per listed outlet, and says "unknown" for checks stored before the split (#874)', () => {
    const check = {
      checkedAt: '2026-09-08T00:00:00Z',
      windowDays: 30,
      keys: [
        {
          key: '2026-18061',
          hits: 3,
          sampleUrls: ['https://www.govexec.com/mine', 'https://news.local/1'],
          nationalHit: true,
          hitsByDomain: {
            'www.govexec.com': ['https://www.govexec.com/mine'],
            'news.local': ['https://news.local/1'],
          },
        },
        {
          key: 'Liz Oyer',
          hits: 2,
          sampleUrls: ['https://www.washingtonpost.com/x', 'https://news.local/1'],
          nationalHit: true,
          hitsByDomain: {
            'www.washingtonpost.com': ['https://www.washingtonpost.com/x'],
            'news.local': ['https://news.local/1'],
          },
        },
      ],
      label: 'likely-covered' as const,
    };
    const outlets = [
      { name: 'Government Executive', domain: 'govexec.com' },
      { name: 'The Washington Post', domain: 'washingtonpost.com' },
      // three Post reporters on one beat → one outlet line, not three
      { name: 'The Washington Post', domain: 'washingtonpost.com' },
    ];
    const lines = coverageLine(check, outlets, 14);
    expect(lines.filter((l) => l.includes('Own outlet — The Washington Post'))).toHaveLength(1);
    expect(lines[0]).toBe('Coverage: 5 hit(s) in 30d — likely covered, read before sending');
    expect(lines).toContain('  Own outlet — Government Executive (govexec.com): 1 hit(s)');
    expect(lines).toContain('    · https://www.govexec.com/mine');
    expect(lines).toContain('  Own outlet — The Washington Post (washingtonpost.com): 1 hit(s)');
    // the shared news.local URL is counted once
    expect(lines).toContain('  Others: 1 hit(s)');
    expect(coverageLine(check)).not.toContain('  Others: 1 hit(s)');

    const legacy = coverageLine(
      { ...check, keys: check.keys.map(({ hitsByDomain: _h, ...k }) => k) },
      outlets.slice(0, 1),
      14,
    );
    expect(legacy).toContain(
      '  Own outlet — Government Executive (govexec.com): unknown (check predates the outlet split; re-run pnpm tips:coverage --candidate 14)',
    );
  });

  it('prunes every URL but keeps counts, label, hosts and errors; the render says so and credits Brave once (#922)', () => {
    const check: TipCoverageCheck = {
      checkedAt: '2026-09-24T00:00:00Z',
      windowDays: 30,
      provider: 'brave',
      keys: [
        {
          key: 'GAO-26-108106',
          hits: 2,
          sampleUrls: ['https://www.pogo.org/x', 'https://thehill.com/y'],
          nationalHit: true,
          hitsByDomain: {
            'www.pogo.org': ['https://www.pogo.org/x'],
            'thehill.com': ['https://thehill.com/y'],
          },
        },
        { key: '39 of 73 cases', hits: 0, sampleUrls: [], error: 'rate limited' },
      ],
      label: 'likely-covered',
    };
    const live = coverageLine(check, [{ name: 'POGO', domain: 'pogo.org' }], 21);
    expect(live.filter((l) => l === POWERED_BY_BRAVE_LINE)).toHaveLength(1);
    expect(live[live.length - 1]).toBe(POWERED_BY_BRAVE_LINE);

    const pruned = pruneCoverageUrls(check, '2026-10-01T05:00:00Z');
    expect(JSON.stringify(pruned)).not.toContain('https://');
    expect(pruned).toMatchObject({
      label: 'likely-covered',
      provider: 'brave',
      urlsPrunedAt: '2026-10-01T05:00:00Z',
      keys: [
        {
          key: 'GAO-26-108106',
          hits: 2,
          nationalHit: true,
          hitsByDomain: { 'www.pogo.org': [], 'thehill.com': [] },
        },
        { key: '39 of 73 cases', hits: 0, error: 'rate limited' },
      ],
    });
    const lines = coverageLine(
      pruned,
      [
        { name: 'POGO', domain: 'pogo.org' },
        { name: 'NOTUS', domain: 'notus.org' },
      ],
      21,
    );
    expect(lines[0]).toBe('Coverage: 2 hit(s) in 30d — likely covered, read before sending');
    expect(lines).toContain('  Own outlet — POGO (pogo.org): hit(s) seen, URLs expired');
    expect(lines).toContain('  Own outlet — NOTUS (notus.org): 0 hit(s)');
    expect(lines).toContain('  · "39 of 73 cases": rate limited');
    expect(lines).toContain(
      '  · hit URLs expired 2026-10-01 (not retained after the candidate closes / 30 d; re-run pnpm tips:coverage --candidate 21)',
    );
    expect(lines.some((l) => l.includes('https://'))).toBe(false);
    expect(lines.filter((l) => l === POWERED_BY_BRAVE_LINE)).toHaveLength(1);
  });
});

describe('coverage — registry and roster paperwork (#865, #920)', () => {
  it('registers both provider hosts as api hosts and gives every reporter an outlet domain', () => {
    const gdelt = ROBOTS_REGISTRY.find((e) => e.host === 'api.gdeltproject.org');
    expect(gdelt).toMatchObject({ kind: 'api', status: 'active' });
    expect(gdelt?.paths).toContain('/api/v2/doc/doc');
    const brave = ROBOTS_REGISTRY.find((e) => e.host === 'api.search.brave.com');
    expect(brave).toMatchObject({ kind: 'api', status: 'active' });
    expect(brave?.paths).toContain('/res/v1/web/search');
    for (const r of ROSTER) expect(r.outletDomain, r.id).toMatch(/^[a-z0-9.-]+\.[a-z]+$/);
  });

  it('selects Brave when its key is set and falls back to GDELT otherwise', () => {
    expect(selectProvider({ BRAVE_SEARCH_API_KEY: 'test-token' }).name).toBe('brave');
    expect(selectProvider({}).name).toBe('gdelt');
    expect(selectProvider({ BRAVE_SEARCH_API_KEY: '   ' }).name).toBe('gdelt');
  });
});

type Body = string | Error | { status: number; text: string };

function harness(
  bodies: Record<string, Body>,
  maxCalls = 30,
  provider: SearchProvider = GDELT_PROVIDER,
) {
  const calls: string[] = [];
  const waits: number[] = [];
  let clock = 1_000_000;
  const run = createCoverageRun({
    provider,
    fetchResponse: async ({ url }) => {
      calls.push(url);
      const p = new URL(url).searchParams;
      const key = decodeURIComponent(p.get('q') ?? p.get('query') ?? '').replace(/"/g, '');
      const b = bodies[key];
      if (b instanceof Error) throw b;
      if (typeof b === 'object') return b;
      return { status: 200, text: b ?? THROTTLE };
    },
    sleep: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
    now: () => clock,
    maxCalls,
  });
  return { checker: run.check, run, calls, waits };
}

describe('coverage checker — injected deps (#865)', () => {
  it('queries only identifier-grade keys, serializes them ≥ spacing apart, and keeps own-outlet hits with their host', async () => {
    const h = harness({
      '2026-18061': artlist(['https://www.govexec.com/mine', 'https://news.local/1']),
      'Liz Oyer': artlist(['https://www.nytimes.com/x'], 'Pardon attorney Liz Oyer sues'),
    });
    const c = await h.checker(['pay freeze', '2026-18061', 'Liz Oyer']);
    // the phrase key was sent unquoted, the code key quoted
    expect(decodeURIComponent(h.calls[0])).toContain('query="2026-18061"');
    expect(decodeURIComponent(h.calls[1])).toContain('query=Liz+Oyer&');
    expect(h.calls).toHaveLength(2);
    expect(h.run.calls()).toBe(2);
    const minusAnchor = await harness({
      '2026-18061': artlist(['https://www.govexec.com/mine', 'https://news.local/1']),
    }).checker(['2026-18061'], ['https://www.govexec.com/mine']);
    expect(minusAnchor.keys[0]).toMatchObject({ hits: 1, nationalHit: false });
    expect(minusAnchor.label).toBe('niche');
    expect(h.waits).toEqual([GDELT_PROVIDER.minSpacingMs]);
    expect(c.provider).toBe('gdelt');
    expect(c.keys).toEqual([
      {
        key: '2026-18061',
        kind: 'code',
        rawHits: 2,
        hits: 2,
        sampleUrls: ['https://www.govexec.com/mine', 'https://news.local/1'],
        nationalHit: true,
        hitsByDomain: {
          'www.govexec.com': ['https://www.govexec.com/mine'],
          'news.local': ['https://news.local/1'],
        },
      },
      {
        key: 'Liz Oyer',
        kind: 'phrase',
        rawHits: 1,
        hits: 1,
        sampleUrls: ['https://www.nytimes.com/x'],
        nationalHit: true,
        hitsByDomain: { 'www.nytimes.com': ['https://www.nytimes.com/x'] },
      },
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

  it('never turns a throttle, a 429, a thrown fetch, or the run cap into a zero', async () => {
    const h = harness({
      '2026-18061': THROTTLE,
      'Liz Oyer': new Error('timeout'),
      'EO 14410': { status: 429, text: '<html>' },
    });
    const c = await h.checker(['2026-18061', 'Liz Oyer', 'EO 14410']);
    expect(c.keys.map((k) => k.error)).toEqual([
      'throttled or invalid response',
      'timeout',
      'rate limited (429)',
    ]);
    expect(c.label).toBe('not-checkable');

    const capped = harness({ '2026-18061': artlist([]), 'Liz Oyer': artlist([]) }, 1);
    const c2 = await capped.checker(['2026-18061', 'Liz Oyer']);
    expect(capped.calls).toHaveLength(1);
    expect(c2.keys[1]).toMatchObject({ error: 'run cap reached' });
    expect(c2.label).toBe('not-checkable');

    // a real zero needs a key that ranks: a phrase or caption with no results
    const clean = harness({ 'Liz Oyer': artlist([]), '2026-18061': artlist([]) });
    expect((await clean.checker(['Liz Oyer'])).label).toBe('checkable-zero');
    expect((await clean.checker(['2026-18061'])).label).toBe('not-checkable');
  });

  it('shares the spacing clock and the cap across tips within one run', async () => {
    const h = harness(
      { '2026-18061': artlist([]), 'EO 14410': artlist([]), 'Liz Oyer': artlist([]) },
      2,
    );
    await h.checker(['2026-18061']);
    const second = await h.checker(['EO 14410', 'Liz Oyer']);
    expect(h.calls).toHaveLength(2);
    expect(h.waits).toEqual([GDELT_PROVIDER.minSpacingMs]);
    expect(second.keys[1].error).toBe('run cap reached');
    expect(createCoverageChecker({ provider: GDELT_PROVIDER })).toBeTypeOf('function');
  });

  it('probes with one call and reports results-or-error without persisting anything', async () => {
    const ok = await probeCoverage(GDELT_PROVIDER, async () => ({
      status: 200,
      text: artlist(['https://a.com/1', 'https://b.com/2']),
    }));
    expect(ok).toEqual({ ok: true, detail: 'JSON, 2 result(s) for "Federal Register" in 7d' });
    const down = await probeCoverage(GDELT_PROVIDER, async () => ({ status: 200, text: THROTTLE }));
    expect(down.ok).toBe(false);
    expect(down.detail).toContain('throttled or invalid response: Please limit requests');
    const dead = await probeCoverage(GDELT_PROVIDER, async () => {
      throw new Error('ECONNRESET');
    });
    expect(dead).toEqual({ ok: false, detail: 'ECONNRESET' });
  });
});
