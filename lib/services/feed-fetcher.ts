import { parseStringPromise } from 'xml2js';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { FEED_CACHE_TTL_S } from '@/lib/data/cache-config';
import type { FeedItem } from '@/lib/parsers/feed-parser';
import { stripHtml } from '@/lib/parsers/feed-parser';
import {
  fetchCourtListenerRecent,
  parseCourtListenerParams,
} from '@/lib/services/courtlistener-fetcher';
import { fetchDojRecent, parseDojSignalParams } from '@/lib/services/doj-fetcher';
import type { Category, Signal } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';

const MAX_SUMMARY_LENGTH = 800;

/** Per-signal fetch result with metadata for source health tracking. */
export interface SignalFetchResult {
  signalId: string;
  signalName: string;
  signalType: string;
  success: boolean;
  documentCount: number;
  durationMs: number;
  errorMessage?: string;
  items: FeedItem[];
}

/** Combined result from fetching all signals in a category. */
export interface CategoryFetchResult {
  items: FeedItem[];
  signalResults: SignalFetchResult[];
}

/**
 * Fetch all feeds for a single category, returning FeedItem[].
 * Runs server-side — calls external APIs directly (no localhost HTTP).
 */
export async function fetchCategoryFeeds(category: Category): Promise<FeedItem[]> {
  const { items } = await fetchCategoryFeedsWithMetadata(category);
  return items;
}

/** Fetch all feeds with per-signal metadata for source health tracking. */
export async function fetchCategoryFeedsWithMetadata(
  category: Category,
): Promise<CategoryFetchResult> {
  const settled = await Promise.allSettled(category.signals.map((s) => fetchSignalWithMetadata(s)));
  const items: FeedItem[] = [];
  const signalResults: SignalFetchResult[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      signalResults.push(r.value);
      items.push(...r.value.items);
    }
  }
  return { items, signalResults };
}

async function fetchSignalWithMetadata(signal: Signal): Promise<SignalFetchResult> {
  const start = Date.now();
  try {
    const items = await fetchSignalInner(signal);
    const validItems = items.filter((i) => !i.isError && !i.isWarning);
    return {
      signalId: signal.id,
      signalName: signal.name,
      signalType: signal.type,
      success: true,
      documentCount: validItems.length,
      durationMs: Date.now() - start,
      items,
    };
  } catch (err) {
    const msg = formatError(err);
    return {
      signalId: signal.id,
      signalName: signal.name,
      signalType: signal.type,
      success: false,
      documentCount: 0,
      durationMs: Date.now() - start,
      errorMessage: msg,
      items: [{ title: `Error loading ${signal.name}`, isError: true }],
    };
  }
}

async function fetchSignalInner(signal: Signal): Promise<FeedItem[]> {
  if (signal.type === 'federal_register') {
    return await fetchFederalRegister(signal);
  }
  if (signal.type === 'courtlistener') {
    return await fetchCourtListenerSignal(signal);
  }
  if (signal.type === 'doj_json') {
    return await fetchDojJsonSignal(signal);
  }
  if (signal.type === 'rss') {
    return await fetchRss(signal);
  }
  if (signal.type === 'json') {
    return await fetchJson(signal);
  }
  if (signal.type === 'html') {
    return await fetchHtml(signal);
  }
  return [];
}

async function fetchCourtListenerSignal(signal: Signal): Promise<FeedItem[]> {
  const cacheKey = CacheKeys.courtlistener(signal.url);
  const cached = await cacheGet<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const params = parseCourtListenerParams(signal.url);
  const items = (await fetchCourtListenerRecent(params)) as FeedItem[];

  await cacheSet(cacheKey, items, FEED_CACHE_TTL_S);
  return items;
}

async function fetchDojJsonSignal(signal: Signal): Promise<FeedItem[]> {
  const cacheKey = CacheKeys.doj(signal.url);
  const cached = await cacheGet<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const params = parseDojSignalParams(signal.url);
  const items = (await fetchDojRecent(params)) as FeedItem[];

  await cacheSet(cacheKey, items, FEED_CACHE_TTL_S);
  return items;
}

async function fetchFederalRegister(signal: Signal): Promise<FeedItem[]> {
  // Parse the internal API URL to extract query params
  const parsed = new URL(signal.url, 'http://localhost');
  const agency = parsed.searchParams.get('agency');
  const type = parsed.searchParams.get('type');
  const term = parsed.searchParams.get('term');

  const params = new URLSearchParams();
  params.set('per_page', '20');
  params.set('order', 'newest');
  if (agency) params.set('conditions[agencies][]', agency);
  if (type) params.set('conditions[type][]', type);
  if (term) params.set('conditions[term]', term);

  const url = `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;
  const cacheKey = CacheKeys.federalRegister(url);

  const cached = await cacheGet<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DemocracyMonitor/1.0',
    },
  });

  if (!response.ok) {
    return [{ title: `Federal Register error: ${response.status}`, isError: true }];
  }

  const data = await response.json();
  const items: FeedItem[] = (data.results || [])
    .slice(0, 8)
    .map(
      (doc: {
        title?: string;
        html_url?: string;
        publication_date?: string;
        agencies?: { name: string }[];
        type?: string;
        abstract?: string;
      }) => ({
        title: doc.title || '(document)',
        link: doc.html_url,
        pubDate: doc.publication_date,
        agency: doc.agencies?.map((a) => a.name).join(', '),
        summary: doc.abstract ? truncate(stripHtml(doc.abstract)) : undefined,
      }),
    );

  await cacheSet(cacheKey, items, FEED_CACHE_TTL_S);
  return items;
}

interface RawRssItem {
  title?: string | { _?: string };
  link?: string | { href?: string; _?: string };
  id?: string;
  pubDate?: string;
  published?: string;
  updated?: string;
  description?: string | { _?: string };
  summary?: string;
  'content:encoded'?: string;
}

function normalizeRssItem(it: RawRssItem): FeedItem {
  const title = typeof it.title === 'string' ? it.title : it.title?._;
  const link =
    typeof it.link === 'string'
      ? it.link
      : (it.link as { href?: string })?.href || (it.link as { _?: string })?._ || it.id;
  const pubDate = it.pubDate || it.published || it.updated;
  const rawSummary =
    it['content:encoded'] ||
    (typeof it.description === 'string' ? it.description : it.description?._) ||
    (typeof it.summary === 'string' ? it.summary : undefined);
  const summary =
    rawSummary && typeof rawSummary === 'string' ? truncate(stripHtml(rawSummary)) : undefined;

  return { title: title || '(item)', link, pubDate, summary };
}

async function fetchRss(signal: Signal): Promise<FeedItem[]> {
  const cacheKey = CacheKeys.proxy(signal.url);
  const cached = await cacheGet<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const response = await fetch(signal.url, {
    headers: {
      'User-Agent': 'DemocracyMonitor/1.0',
      Accept: 'application/xml, text/xml, application/rss+xml, */*',
    },
  });

  if (!response.ok) {
    return [{ title: `RSS error: ${response.status}`, isError: true }];
  }

  const text = await response.text();
  const parsed = await parseStringPromise(text, { explicitArray: false, mergeAttrs: true });
  const rawItems = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
  const arr = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const items: FeedItem[] = arr.slice(0, 8).map(normalizeRssItem);

  await cacheSet(cacheKey, items, FEED_CACHE_TTL_S);
  return items;
}

async function fetchJson(signal: Signal): Promise<FeedItem[]> {
  // JSON signals with internal API URLs (e.g. /api/uptime/status)
  // Skip these in server-side context since they need the app running
  if (signal.url.startsWith('/api/')) {
    return [{ title: `${signal.name}: skipped (internal API)`, isWarning: true }];
  }

  const cacheKey = CacheKeys.proxy(signal.url);
  const cached = await cacheGet<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const response = await fetch(signal.url, {
    headers: { 'User-Agent': 'DemocracyMonitor/1.0', Accept: 'application/json' },
  });

  if (!response.ok) {
    return [{ title: `JSON error: ${response.status}`, isError: true }];
  }

  const data = await response.json();
  const items: FeedItem[] = Array.isArray(data)
    ? data.slice(0, 8).map((d: { title?: string; link?: string; url?: string }) => ({
        title: d.title || '(item)',
        link: d.link || d.url,
      }))
    : [{ title: `${signal.name}: data received`, link: signal.url }];

  await cacheSet(cacheKey, items, FEED_CACHE_TTL_S);
  return items;
}

async function fetchHtml(signal: Signal): Promise<FeedItem[]> {
  const cacheKey = CacheKeys.proxy(signal.url);
  const cached = await cacheGet<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const response = await fetch(signal.url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,*/*',
    },
  });

  if (!response.ok) {
    return [{ title: `HTML error: ${response.status}`, isError: true }];
  }

  const text = await response.text();
  const anchors = Array.from(text.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi))
    .slice(0, 10)
    .map((m) => ({
      href: m[1].startsWith('http') ? m[1] : new URL(m[1], signal.url).toString(),
      text: m[2].replace(/<[^>]*>/g, '').trim(),
    }))
    .filter((item) => item.text.length > 5 && !item.href.includes('javascript:'));

  const items: FeedItem[] =
    anchors.length > 0
      ? anchors.map((a) => ({ title: a.text, link: a.href }))
      : [{ title: 'No links found - site may be blocking requests', isWarning: true }];

  await cacheSet(cacheKey, items, FEED_CACHE_TTL_S);
  return items;
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '…' : text;
}
