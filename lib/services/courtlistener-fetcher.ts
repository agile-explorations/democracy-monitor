import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const CL_BASE_URL = 'https://www.courtlistener.com';
const CL_API_V4 = `${CL_BASE_URL}/api/rest/v4`;
const RATE_LIMIT_DELAY_MS = 750;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_SUMMARY_LENGTH = 800;

/** Fields returned by CourtListener V4 search API (RECAP type=r). */
interface ClDocketEntry {
  docket_id?: number;
  docket_absolute_url?: string;
  caseName?: string;
  dateFiled?: string;
  court?: string;
  suitNature?: string;
  cause?: string;
  docketNumber?: string;
}

interface ClSearchResult {
  count?: number;
  next?: string | null;
  results?: ClDocketEntry[];
}

/**
 * Parse a courtlistener:// pseudo-URL into API query parameters.
 * Format: courtlistener://recap?nos=440&type=opinion
 * The path segment (recap/opinions) maps to CL search type param:
 *   recap → type=r (RECAP dockets, supports nature_of_suit)
 *   opinions → type=o (opinions, supports text search)
 *   (default) → type=o
 */
export function parseCourtListenerParams(signalUrl: string): {
  nos?: string;
  type?: string;
  query?: string;
  searchType: string;
} {
  const parsed = new URL(signalUrl.replace('courtlistener://', 'http://cl/'));
  const path = parsed.pathname.replace(/^\//, '');
  const searchType = path === 'recap' ? 'r' : 'o';
  return {
    nos: parsed.searchParams.get('nos') || undefined,
    type: parsed.searchParams.get('type') || undefined,
    query: parsed.searchParams.get('q') || undefined,
    searchType,
  };
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '\u2026' : text;
}

/** Convert a CourtListener docket entry to a ContentItem. */
export function toContentItem(doc: ClDocketEntry): ContentItem {
  const rawUrl = doc.docket_absolute_url;
  const url = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${CL_BASE_URL}${rawUrl}`) : undefined;

  const summary = doc.cause || doc.suitNature;

  return {
    title: doc.caseName || '(untitled case)',
    link: url,
    pubDate: doc.dateFiled,
    agency: doc.court || 'Federal Court',
    summary: summary ? truncate(summary) : undefined,
    type: 'court_opinion',
    sourceOrigin: 'courtlistener',
    metadata: {
      docketNumber: doc.docketNumber,
      suitNature: doc.suitNature,
    },
  };
}

function getAuthHeaders(): Record<string, string> {
  const token = process.env.COURTLISTENER_API_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'DemocracyMonitor/1.0',
  };
  if (token) {
    headers.Authorization = `Token ${token}`;
  }
  return headers;
}

type ClParams = { nos?: string; type?: string; query?: string; searchType: string };

/**
 * Split multi-NOS params into individual param sets.
 * CL API only supports one nature_of_suit value per request.
 */
export function expandNosParams(params: ClParams): ClParams[] {
  if (!params.nos || !params.nos.includes(',')) return [params];
  return params.nos.split(',').map((code) => ({ ...params, nos: code.trim() }));
}

function buildSearchUrl(params: ClParams): string {
  const qs = new URLSearchParams();
  qs.set('type', params.searchType);
  if (params.nos) qs.set('nature_of_suit', params.nos);
  if (params.query) qs.set('q', params.query);
  return `${CL_API_V4}/search/?${qs.toString()}`;
}

/** Fetch recent CourtListener docket entries for the snapshot pipeline. */
export async function fetchCourtListenerRecent(params: ClParams): Promise<ContentItem[]> {
  const expanded = expandNosParams(params);
  const allItems: ContentItem[] = [];

  for (const p of expanded) {
    const url = buildSearchUrl(p);
    const response = await fetch(url, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[courtlistener] HTTP ${response.status}`);
      continue;
    }
    const data: ClSearchResult = await response.json();
    allItems.push(...(data.results || []).slice(0, 20).map(toContentItem));
    if (expanded.length > 1) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return allItems;
}

/** Paginate through one CL search query, returning all items. */
async function fetchPaginatedSearch(baseUrl: string, maxPages: number): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  let url: string | null = baseUrl;
  let page = 0;

  while (url && page < maxPages) {
    const response = await fetch(url, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[courtlistener] HTTP ${response.status} on page ${page}`);
      break;
    }

    const data: ClSearchResult = await response.json();
    items.push(...(data.results || []).map(toContentItem));
    url = data.next || null;
    page++;

    if (url) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return items;
}

/** Fetch historical CourtListener entries for the backfill pipeline. */
export async function fetchCourtListenerHistorical(
  params: ClParams & { dateFrom: string; dateTo: string; maxPages?: number },
): Promise<ContentItem[]> {
  const { dateFrom, dateTo, maxPages = 15 } = params;
  const expanded = expandNosParams(params);
  const allItems: ContentItem[] = [];

  for (const p of expanded) {
    const qs = new URLSearchParams();
    qs.set('type', p.searchType);
    if (p.nos) qs.set('nature_of_suit', p.nos);
    if (p.query) qs.set('q', p.query);
    qs.set('filed_after', dateFrom);
    qs.set('filed_before', dateTo);

    const url = `${CL_API_V4}/search/?${qs.toString()}`;
    const items = await fetchPaginatedSearch(url, maxPages);
    allItems.push(...items);

    if (expanded.length > 1) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return allItems;
}
