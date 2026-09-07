import { describe, expect, it } from 'vitest';
import {
  articleKey,
  dedupeByKey,
  discoverArticles,
  extractArticleLinks,
  extractLede,
  extractMetaValues,
  extractPublishedAt,
  extractSitemapEntries,
  isReactive,
  matchesAuthor,
  parseRssText,
  probeSource,
  sitemapUrlsFor,
} from '@/lib/tipwire/acquire';
import { getReporter } from '@/lib/tipwire/roster';
import type { ReporterEntry } from '@/lib/tipwire/roster';
import {
  GOVEXEC_ARTICLE_OTHER,
  GOVEXEC_ARTICLE_WAGNER,
  GOVEXEC_RSS,
  GOVEXEC_WORKFORCE_RSS,
  NOTUS_ARTICLE_KATZ,
  NOTUS_ARTICLE_OTHER,
  NOTUS_AUTHOR_PAGE,
  NOTUS_SITEMAP,
  PROPUBLICA_ARTICLE_OTHER,
  PROPUBLICA_ARTICLE_ROSENBERG,
  PROPUBLICA_PEOPLE_PAGE,
  PROPUBLICA_RSS,
} from '../../fixtures/tipwire/fixtures';

const NOW = new Date('2026-09-07T20:00:00Z');

const must = (id: string): ReporterEntry => {
  const r = getReporter(id);
  if (!r) throw new Error(id);
  return r;
};

function fakeFetch(pages: Record<string, string>) {
  return async (url: string) => {
    const key = articleKey(url);
    const hit = pages[url] ?? pages[key];
    return hit === undefined ? { status: 404, text: '' } : { status: 200, text: hit };
  };
}

const quiet = { politenessMs: 0, now: NOW };

describe('tipwire acquisition — pure parsing (#854)', () => {
  it('parses RSS items and strips HTML from summaries', async () => {
    const items = await parseRssText(GOVEXEC_RSS);
    expect(items).toHaveLength(2);
    expect(items[0].summary).toBe(
      'The Agriculture Department is telling a federal court that a majority of employees agreed to relocate.',
    );
    expect(items[0].pubDate).toContain('2026');
  });

  it('reads dc:creator (CDATA, multiple) into creators', async () => {
    const [first] = await parseRssText(PROPUBLICA_RSS);
    expect(first.creators).toEqual(['by Mica Rosenberg', 'Perla Trevizo']);
  });

  it('dedupes across feeds by canonical link (query strings ignored)', async () => {
    const all = [
      ...(await parseRssText(GOVEXEC_RSS)),
      ...(await parseRssText(GOVEXEC_WORKFORCE_RSS)),
    ];
    expect(dedupeByKey(all)).toHaveLength(2);
    expect(articleKey('https://x.org/a/b/?utm=1#top')).toBe('https://x.org/a/b');
  });

  it('extracts article-shaped links from an author page and ignores site chrome and duplicates', () => {
    const feed = must('katz').feed;
    if (feed?.kind !== 'author-page') throw new Error('katz must be author-page');
    const links = extractArticleLinks(NOTUS_AUTHOR_PAGE, feed.url, feed.articlePathPattern);
    expect(links).toEqual([
      'https://www.notus.org/perspectives/dana-milbank',
      'https://www.notus.org/federal-agencies/opm-buyout-round-two',
      'https://www.notus.org/2026-election/doj-encourages-election-monitor',
    ]);
  });

  it('reads sitemap entries with lastmod and builds the last N monthly URLs', () => {
    const entries = extractSitemapEntries(NOTUS_SITEMAP);
    expect(entries).toHaveLength(3);
    expect(entries[1]).toEqual({
      loc: 'https://www.notus.org/2026-election/doj-encourages-election-monitor',
      lastmod: '2026-09-01T22:52:04.000Z',
    });
    expect(sitemapUrlsFor('https://x.org/sitemap-{YYYYMM}.xml', 2, NOW)).toEqual([
      'https://x.org/sitemap-202609.xml',
      'https://x.org/sitemap-202608.xml',
    ]);
  });

  it('lede precedence: JSON-LD beats og; og alone still works; none otherwise', () => {
    expect(extractLede(NOTUS_ARTICLE_KATZ)).toEqual({
      lede: 'Assistant Attorney General Harmeet Dhillon has said she hopes to dispatch 1,000 monitors nationwide on Election Day.',
      source: 'jsonld',
    });
    expect(extractLede(NOTUS_ARTICLE_OTHER)).toEqual({
      lede: 'A lede from og only.',
      source: 'og',
    });
    expect(extractLede('<html></html>')).toEqual({ lede: null, source: 'none' });
  });

  it('published date: JSON-LD, then article:published_time', () => {
    expect(extractPublishedAt(NOTUS_ARTICLE_KATZ)).toBe('2026-09-01T22:52:04.475Z');
    expect(extractPublishedAt(NOTUS_ARTICLE_OTHER)).toBe('2026-09-02T12:00:00.000Z');
    expect(extractPublishedAt('<html></html>')).toBeNull();
  });

  it('matches bylines across "by", commas, "and", accents and author URLs; counts co-authors', () => {
    expect(matchesAuthor(['by Mica Rosenberg', 'Perla Trevizo'], 'Mica Rosenberg')).toEqual({
      match: true,
      coauthorCount: 1,
    });
    expect(matchesAuthor(['Erich Wagner, Eric Katz and Someone Else'], 'Erich Wagner')).toEqual({
      match: true,
      coauthorCount: 2,
    });
    expect(matchesAuthor(['Érich Wagner'], 'Erich Wagner').match).toBe(true);
    expect(matchesAuthor(['Jory Heckman'], 'Erich Wagner').match).toBe(false);
    expect(
      matchesAuthor(
        ['https://www.notus.org/eric-katz', 'https://www.notus.org/derek-hawkins'],
        'Eric Katz',
      ),
    ).toEqual({ match: true, coauthorCount: 1 });
    expect(extractMetaValues(GOVEXEC_ARTICLE_WAGNER, 'sailthru.author')).toEqual(['Erich Wagner']);
  });

  it('reactive means published within the last 24 h (null and stale dates are not)', () => {
    expect(isReactive('2026-09-07T10:00:00Z', NOW)).toBe(true);
    expect(isReactive('2026-09-06T19:00:00Z', NOW)).toBe(false);
    expect(isReactive(null, NOW)).toBe(false);
    expect(isReactive('not a date', NOW)).toBe(false);
  });
});

describe('tipwire acquisition — strategies on fixtures (#854)', () => {
  it('rss with page attribution: keeps only the reporter’s items, reads the page byline once each', async () => {
    const wagner = must('wagner');
    const pages = {
      'https://www.govexec.com/rss/all/': GOVEXEC_RSS,
      'https://www.govexec.com/rss/pay-benefits/': GOVEXEC_WORKFORCE_RSS,
      'https://www.govexec.com/rss/workforce/': GOVEXEC_WORKFORCE_RSS,
      'https://www.govexec.com/management/2026/09/usda-employees-challenge/415818':
        GOVEXEC_ARTICLE_OTHER,
      'https://www.govexec.com/workforce/2026/09/opm-probationary-rule/415900':
        GOVEXEC_ARTICLE_WAGNER,
    };
    const r = await discoverArticles(wagner, {
      knownKeys: new Set(),
      fetchText: fakeFetch(pages),
      ...quiet,
    });
    expect(r.errors).toEqual([]);
    expect(r.listed).toBe(2);
    expect(r.pageFetches).toBe(2);
    expect(r.articles.map((a) => a.title)).toEqual(['OPM finalizes rule on probationary periods']);
    expect(r.articles[0]).toMatchObject({
      reporterId: 'wagner',
      feedStrategy: 'rss',
      attribution: 'sailthru.author',
      ledeSource: 'rss',
      lede: 'OPM issued a final rule.',
      coauthorCount: 0,
    });
  });

  it('rss with item attribution (dc:creator): no page fetch, co-author count from creators', async () => {
    const beavers = must('beavers');
    if (beavers.feed?.kind !== 'rss') throw new Error('beavers must be rss');
    const r = await discoverArticles(
      { ...beavers, name: 'Mica Rosenberg' },
      {
        knownKeys: new Set(),
        fetchText: fakeFetch({ [beavers.feed.urls[0]]: PROPUBLICA_RSS }),
        ...quiet,
      },
    );
    expect(r.pageFetches).toBe(0);
    expect(r.articles).toHaveLength(1);
    expect(r.articles[0]).toMatchObject({
      title: 'ICE Detention Deaths Rose Sharply in 2026',
      attribution: 'dc:creator',
      coauthorCount: 1,
      publishedAt: '2026-09-04T10:00:00.000Z',
    });
  });

  it('author-page with sitemap: only dated real articles, newest first; attributes by article:author; reads JSON-LD', async () => {
    const katz = must('katz');
    const pages = {
      'https://www.notus.org/eric-katz': NOTUS_AUTHOR_PAGE,
      'https://www.notus.org/sitemap-202609.xml': NOTUS_SITEMAP,
      'https://www.notus.org/2026-election/doj-encourages-election-monitor': NOTUS_ARTICLE_KATZ,
      'https://www.notus.org/federal-agencies/opm-buyout-round-two': NOTUS_ARTICLE_OTHER,
    };
    const r = await discoverArticles(katz, {
      knownKeys: new Set(),
      fetchText: fakeFetch(pages),
      ...quiet,
    });
    // the columnist index page is not in the sitemap → never fetched
    expect(r.listed).toBe(2);
    expect(r.pageFetches).toBe(2);
    expect(r.errors.filter((e) => !e.includes('sitemap-202608'))).toEqual([]);
    expect(r.articles).toHaveLength(1);
    expect(r.articles[0]).toMatchObject({
      articleKey: 'https://www.notus.org/2026-election/doj-encourages-election-monitor',
      title: 'DOJ Leader Encourages Employees to Sign Up for Election Monitor Duty',
      ledeSource: 'jsonld',
      publishedAt: '2026-09-01T22:52:04.475Z',
      coauthorCount: 1,
      feedStrategy: 'author-page',
      attribution: 'article:author',
    });

    const again = await discoverArticles(katz, {
      knownKeys: new Set(['https://www.notus.org/2026-election/doj-encourages-election-monitor']),
      fetchText: fakeFetch(pages),
      ...quiet,
    });
    expect(again.listed).toBe(1);
    expect(again.articles).toHaveLength(0);
  });

  it('author-page without sitemap (ProPublica): parsely-author attribution among co-authors', async () => {
    const rosenberg = must('rosenberg');
    const pages = {
      'https://www.propublica.org/people/mica-rosenberg': PROPUBLICA_PEOPLE_PAGE,
      'https://www.propublica.org/article/trump-deportations-deployed-resources-tent-company':
        PROPUBLICA_ARTICLE_ROSENBERG,
      'https://www.propublica.org/article/ice-detention-deaths-2026': PROPUBLICA_ARTICLE_OTHER,
    };
    const r = await discoverArticles(rosenberg, {
      knownKeys: new Set(),
      fetchText: fakeFetch(pages),
      ...quiet,
    });
    expect(r.listed).toBe(2);
    expect(r.articles).toHaveLength(1);
    expect(r.articles[0]).toMatchObject({
      title: 'A Tent Company Made Billions on Detention',
      attribution: 'parsely-author',
      coauthorCount: 2,
      ledeSource: 'og',
      publishedAt: '2025-04-11T09:00:00.000Z',
    });
  });

  it('caps page fetches per run and reports host failures without throwing', async () => {
    const rosenberg = must('rosenberg');
    const r = await discoverArticles(rosenberg, {
      knownKeys: new Set(),
      fetchText: fakeFetch({
        'https://www.propublica.org/people/mica-rosenberg': PROPUBLICA_PEOPLE_PAGE,
      }),
      maxPageFetches: 1,
      ...quiet,
    });
    expect(r.pageFetches).toBe(1);
    expect(r.errors[0]).toContain('HTTP 404');
    const down = await discoverArticles(rosenberg, {
      knownKeys: new Set(),
      fetchText: async () => {
        throw new Error('ECONNRESET');
      },
      ...quiet,
    });
    expect(down.articles).toEqual([]);
    expect(down.errors[0]).toContain('ECONNRESET');
  });

  it('probe reports per-source status and counts, and no path for walled outlets', async () => {
    const ok = await probeSource(
      must('rosenberg'),
      fakeFetch({ 'https://www.propublica.org/people/mica-rosenberg': PROPUBLICA_PEOPLE_PAGE }),
      0,
    );
    expect(ok).toMatchObject({ kind: 'author-page', ok: true });
    expect(ok.detail).toContain('(2 article links)');
    const walled = await probeSource(must('parloff'), fakeFetch({}), 0);
    expect(walled).toMatchObject({ kind: 'none', ok: false });
  });
});
