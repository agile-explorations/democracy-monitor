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
import { fetchFecRecent, parseFecParams } from '@/lib/services/fec-fetcher';
import { fetchGovInfoRecent, parseGovInfoParams } from '@/lib/services/govinfo-fetcher';
import type { Signal } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

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

/**
 * Fetch a single signal and return result with metadata.
 * Used by the snapshot pipeline for API-based signals that need
 * individual fetch tracking (health checks, fetch logs).
 */
export async function fetchSignalWithMetadata(signal: Signal): Promise<SignalFetchResult> {
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
  if (signal.type === 'govinfo') {
    return await fetchGovInfoSignal(signal);
  }
  if (signal.type === 'fec_json') {
    return await fetchFecJsonSignal(signal);
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

async function fetchGovInfoSignal(signal: Signal): Promise<FeedItem[]> {
  const cacheKey = CacheKeys.govinfo(signal.url);
  const cached = await cacheGet<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const params = parseGovInfoParams(signal.url);
  const items = (await fetchGovInfoRecent(params)) as FeedItem[];

  await cacheSet(cacheKey, items, FEED_CACHE_TTL_S);
  return items;
}

async function fetchFecJsonSignal(signal: Signal): Promise<FeedItem[]> {
  const cacheKey = CacheKeys.fec(signal.url);
  const cached = await cacheGet<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const params = parseFecParams(signal.url);
  const items = (await fetchFecRecent(params)) as FeedItem[];

  await cacheSet(cacheKey, items, FEED_CACHE_TTL_S);
  return items;
}

function buildFrRecentUrl(signalUrl: string): string {
  const parsed = new URL(signalUrl, 'http://localhost');
  const agencyRaw = parsed.searchParams.get('agency');
  const type = parsed.searchParams.get('type');
  const term = parsed.searchParams.get('term');

  const params = new URLSearchParams();
  params.set('per_page', '20');
  params.set('order', 'newest');
  if (agencyRaw) {
    for (const slug of agencyRaw.split(',').map((s) => s.trim())) {
      params.append('conditions[agencies][]', slug);
    }
  }
  if (type) params.set('conditions[type][]', type);
  if (term) params.set('conditions[term]', term);

  return `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;
}

async function fetchFederalRegister(signal: Signal): Promise<FeedItem[]> {
  const url = buildFrRecentUrl(signal.url);
  const cacheKey = CacheKeys.federalRegister(url);

  const cached = await cacheGet<FeedItem[]>(cacheKey);
  if (cached) return cached;

  const response = await fetchWithRetry(
    url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DemocracyMonitor/1.0',
      },
    },
    { label: signal.id },
  );

  if (!response.ok) {
    return [{ title: `Federal Register error: ${response.status}`, isError: true }];
  }

  const data = await response.json();
  const items: FeedItem[] = (data.results || []).map(
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
      content: doc.abstract ? truncate(stripHtml(doc.abstract)) : undefined,
    }),
  );

  await cacheSet(cacheKey, items, FEED_CACHE_TTL_S);
  return items;
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '…' : text;
}
