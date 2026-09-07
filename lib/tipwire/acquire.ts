/**
 * R-TIPWIRE byline acquisition (#854). Two sanctioned strategies, both
 * probe-verified 2026-09-07 and registered in lib/data/robots-registry.ts:
 *
 * - `rss`: parse the outlet's feed(s); attribute from the item (`dc:creator`)
 *   or, when the feed carries no byline, from one article-page meta fetch.
 * - `author-page`: no feed exists; list the author page's article links and
 *   read each new article's JSON-LD / metas for author, date and lede.
 *
 * Discipline: project UA, ≥2 s politeness (the host's Crawl-delay wins when
 * larger), 30 s timeout, at most MAX_NEW_PAGE_FETCHES article pages per
 * reporter per run, and a host failure logs and continues. Everything
 * network-bound goes through an injected `FetchText` so the strategies are
 * unit-tested on fixtures. Pure parsing lives in ./parse.
 *
 * Nothing here touches `documents`; discovered articles are plain objects
 * the store (#858) writes to tip_articles.
 */

import { sleep } from '@/lib/utils/async';
import {
  articleKey,
  dedupeByKey,
  extractArticleLinks,
  extractLede,
  extractMetaValues,
  extractPublishedAt,
  extractSitemapEntries,
  extractTitle,
  matchesAuthor,
  nameSlug,
  parseRssText,
  sitemapUrlsFor,
  toIso,
} from './parse';
import type { LedeSource, RssItemLite } from './parse';
import type { ReporterEntry, ReporterFeed } from './roster';

export * from './parse';

export const TIPWIRE_UA = 'DemocracyMonitor/1.0 (civic monitoring)';
export const FETCH_TIMEOUT_MS = 30_000;
export const DEFAULT_POLITENESS_MS = 2_000;
export const MAX_NEW_PAGE_FETCHES = 15;

export interface DiscoveredArticle {
  reporterId: string;
  outlet: string;
  articleKey: string;
  url: string | null;
  title: string;
  lede: string | null;
  ledeSource: LedeSource;
  publishedAt: string | null;
  feedStrategy: ReporterFeed['kind'];
  attribution: string;
  coauthorCount: number;
  rawMeta: Record<string, string>;
}

export type FetchText = (url: string) => Promise<{ status: number; text: string }>;

export interface DiscoverOptions {
  /** article_keys already stored for this reporter (anti-join). */
  knownKeys: ReadonlySet<string>;
  fetchText?: FetchText;
  maxPageFetches?: number;
  /** Politeness override (tests pass 0); otherwise max(our floor, host Crawl-delay). */
  politenessMs?: number;
  /** Clock for sitemap month selection (tests pin it). */
  now?: Date;
}

export interface DiscoverResult {
  articles: DiscoveredArticle[];
  listed: number;
  pageFetches: number;
  errors: string[];
}

type Resolved = Required<Omit<DiscoverOptions, 'knownKeys'>> & { knownKeys: ReadonlySet<string> };
type RssFeed = Extract<ReporterFeed, { kind: 'rss' }>;
type AuthorPageFeed = Extract<ReporterFeed, { kind: 'author-page' }>;

export async function fetchTextWithUa(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': TIPWIRE_UA, Accept: 'text/html,application/xml,*/*;q=0.8' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return { status: res.status, text: res.ok ? await res.text() : '' };
}

async function polite(ms: number): Promise<void> {
  if (ms > 0) await sleep(ms);
}

function emptyResult(): DiscoverResult {
  return { articles: [], listed: 0, pageFetches: 0, errors: [] };
}

/** Fetch one URL, recording HTTP/network failures on the result; null on failure. */
async function fetchPage(
  url: string,
  label: string,
  opts: Resolved,
  result: DiscoverResult,
): Promise<string | null> {
  try {
    const { status, text } = await opts.fetchText(url);
    if (status === 200) return text;
    result.errors.push(`${label} HTTP ${status}`);
  } catch (err) {
    result.errors.push(`${label} ${(err as Error).message}`);
  }
  return null;
}

async function listFeedItems(
  entry: ReporterEntry,
  feed: RssFeed,
  opts: Resolved,
  result: DiscoverResult,
): Promise<RssItemLite[]> {
  const items: RssItemLite[] = [];
  for (const url of feed.urls) {
    await polite(opts.politenessMs);
    const text = await fetchPage(url, `${entry.id}: feed ${url}`, opts, result);
    if (text) items.push(...(await parseRssText(text)));
  }
  return dedupeByKey(items).filter((it) => !opts.knownKeys.has(articleKey(it.link as string)));
}

/** One rss item → article (or null when not this reporter's / unfetchable). */
async function rssItemToArticle(
  entry: ReporterEntry,
  feed: RssFeed,
  item: RssItemLite,
  opts: Resolved,
  result: DiscoverResult,
): Promise<DiscoveredArticle | null> {
  const key = articleKey(item.link as string);
  const rawMeta: Record<string, string> = {};
  let lede = item.summary;
  let ledeSource: LedeSource = item.summary ? 'rss' : 'none';
  let attribution: string;
  let verdict: { match: boolean; coauthorCount: number };

  if (feed.author.in === 'item') {
    attribution = feed.author.element;
    verdict = matchesAuthor(item.creators, entry.name);
    rawMeta.creators = item.creators.join(' | ');
  } else {
    attribution = feed.author.meta;
    await polite(opts.politenessMs);
    result.pageFetches++;
    const html = await fetchPage(key, `${entry.id}: page ${key}`, opts, result);
    if (!html) return null;
    const metas = extractMetaValues(html, feed.author.meta);
    verdict = matchesAuthor(metas, entry.name);
    rawMeta.byline = metas.join(' | ');
    if (!lede) ({ lede, source: ledeSource } = extractLede(html));
  }
  if (!verdict.match) return null;
  return {
    reporterId: entry.id,
    outlet: entry.outlet,
    articleKey: key,
    url: key,
    title: item.title,
    lede,
    ledeSource,
    publishedAt: item.pubDate ? toIso(item.pubDate) : null,
    feedStrategy: 'rss',
    attribution,
    coauthorCount: verdict.coauthorCount,
    rawMeta,
  };
}

async function discoverRss(
  entry: ReporterEntry,
  feed: RssFeed,
  opts: Resolved,
): Promise<DiscoverResult> {
  const result = emptyResult();
  const fresh = await listFeedItems(entry, feed, opts, result);
  result.listed = fresh.length;
  for (const item of fresh) {
    if (feed.author.in === 'page' && result.pageFetches >= opts.maxPageFetches) break;
    const article = await rssItemToArticle(entry, feed, item, opts, result);
    if (article) result.articles.push(article);
  }
  return result;
}

/** One author-page article link → article (or null). */
async function pageToArticle(
  entry: ReporterEntry,
  feed: AuthorPageFeed,
  key: string,
  lastmod: string | null,
  opts: Resolved,
  result: DiscoverResult,
): Promise<DiscoveredArticle | null> {
  const html = await fetchPage(key, `${entry.id}: page ${key}`, opts, result);
  if (!html) return null;
  const authors = extractMetaValues(html, feed.authorMeta);
  const verdict = matchesAuthor(authors, entry.name);
  const authorSlug = feed.url.replace(/\/+$/, '').split('/').pop() ?? nameSlug(entry.name);
  const bySlug = authors.some((a) => a.replace(/\/+$/, '').endsWith('/' + authorSlug));
  if (!verdict.match && !bySlug) return null;
  const { lede, source } = extractLede(html);
  return {
    reporterId: entry.id,
    outlet: entry.outlet,
    articleKey: key,
    url: key,
    title: extractTitle(html, key),
    lede,
    ledeSource: source,
    publishedAt: extractPublishedAt(html) ?? lastmod,
    feedStrategy: 'author-page',
    attribution: feed.authorMeta,
    coauthorCount: verdict.coauthorCount,
    rawMeta: { authors: authors.join(' | ') },
  };
}

/** Listing links, optionally intersected with the recent monthly sitemaps
 *  (real, dated articles only; newest first). Falls back to listing order
 *  when no sitemap is configured or none could be fetched. */
async function listAuthorPageLinks(
  entry: ReporterEntry,
  feed: AuthorPageFeed,
  opts: Resolved,
  result: DiscoverResult,
): Promise<Array<{ key: string; lastmod: string | null }>> {
  const listing = await fetchPage(feed.url, `${entry.id}: author page`, opts, result);
  if (!listing) return [];
  const links = extractArticleLinks(listing, feed.url, feed.articlePathPattern);
  if (!feed.sitemap) return links.map((key) => ({ key, lastmod: null }));

  const dated = new Map<string, string | null>();
  for (const url of sitemapUrlsFor(feed.sitemap.urlTemplate, feed.sitemap.months, opts.now)) {
    await polite(opts.politenessMs);
    const xml = await fetchPage(url, `${entry.id}: sitemap ${url}`, opts, result);
    if (xml) for (const e of extractSitemapEntries(xml)) dated.set(e.loc, e.lastmod);
  }
  if (dated.size === 0) return links.map((key) => ({ key, lastmod: null }));
  return links
    .filter((key) => dated.has(key))
    .map((key) => ({ key, lastmod: dated.get(key) ?? null }))
    .sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''));
}

async function discoverAuthorPage(
  entry: ReporterEntry,
  feed: AuthorPageFeed,
  opts: Resolved,
): Promise<DiscoverResult> {
  const result = emptyResult();
  const fresh = (await listAuthorPageLinks(entry, feed, opts, result)).filter(
    (l) => !opts.knownKeys.has(l.key),
  );
  result.listed = fresh.length;
  for (const { key, lastmod } of fresh) {
    if (result.pageFetches >= opts.maxPageFetches) break;
    await polite(opts.politenessMs);
    result.pageFetches++;
    const article = await pageToArticle(entry, feed, key, lastmod, opts, result);
    if (article) result.articles.push(article);
  }
  return result;
}

/** Discover this reporter's new articles under the entry's strategy. */
export async function discoverArticles(
  entry: ReporterEntry,
  options: DiscoverOptions,
): Promise<DiscoverResult> {
  if (!entry.feed) return emptyResult();
  const hostPoliteness =
    entry.feed.kind === 'author-page'
      ? Math.max(DEFAULT_POLITENESS_MS, entry.feed.politenessMs)
      : DEFAULT_POLITENESS_MS;
  const opts: Resolved = {
    knownKeys: options.knownKeys,
    fetchText: options.fetchText ?? fetchTextWithUa,
    maxPageFetches: options.maxPageFetches ?? MAX_NEW_PAGE_FETCHES,
    politenessMs: options.politenessMs ?? hostPoliteness,
    now: options.now ?? new Date(),
  };
  return entry.feed.kind === 'rss'
    ? discoverRss(entry, entry.feed, opts)
    : discoverAuthorPage(entry, entry.feed, opts);
}

export interface ProbeResult {
  reporterId: string;
  kind: ReporterFeed['kind'] | 'none';
  ok: boolean;
  detail: string;
}

/** One fetch per source, no article pages — the canary the exception discipline requires. */
export async function probeSource(
  entry: ReporterEntry,
  fetchText: FetchText = fetchTextWithUa,
  politenessMs: number = DEFAULT_POLITENESS_MS,
): Promise<ProbeResult> {
  if (!entry.feed) {
    return { reporterId: entry.id, kind: 'none', ok: false, detail: 'no sanctioned path' };
  }
  try {
    if (entry.feed.kind === 'rss') {
      const counts: string[] = [];
      for (const url of entry.feed.urls) {
        const { status, text } = await fetchText(url);
        const n = status === 200 ? (await parseRssText(text)).length : 0;
        counts.push(`${url} → ${status} (${n} items)`);
        await polite(politenessMs);
      }
      const ok = counts.every((c) => /→ 200/.test(c));
      return { reporterId: entry.id, kind: 'rss', ok, detail: counts.join('; ') };
    }
    const { status, text } = await fetchText(entry.feed.url);
    const links =
      status === 200
        ? extractArticleLinks(text, entry.feed.url, entry.feed.articlePathPattern)
        : [];
    return {
      reporterId: entry.id,
      kind: 'author-page',
      ok: status === 200 && links.length > 0,
      detail: `${entry.feed.url} → ${status} (${links.length} article links)`,
    };
  } catch (err) {
    return {
      reporterId: entry.id,
      kind: entry.feed.kind,
      ok: false,
      detail: (err as Error).message,
    };
  }
}
