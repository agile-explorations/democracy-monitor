import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const CL_BASE_URL = 'https://www.courtlistener.com';
const CL_API_V4 = `${CL_BASE_URL}/api/rest/v4`;
const RATE_LIMIT_DELAY_MS = 750;
const MAX_SUMMARY_LENGTH = 800;

interface ClDocketEntry {
  id?: number;
  absolute_url?: string;
  case_name?: string;
  date_filed?: string;
  court?: string;
  nature_of_suit?: string;
  description?: string;
}

interface ClSearchResult {
  count?: number;
  next?: string | null;
  results?: ClDocketEntry[];
}

/**
 * Parse a courtlistener:// pseudo-URL into API query parameters.
 * Format: courtlistener://recap?nos=440&type=opinion
 */
export function parseCourtListenerParams(signalUrl: string): {
  nos?: string;
  type?: string;
  query?: string;
} {
  const parsed = new URL(signalUrl.replace('courtlistener://', 'http://cl/'));
  return {
    nos: parsed.searchParams.get('nos') || undefined,
    type: parsed.searchParams.get('type') || undefined,
    query: parsed.searchParams.get('q') || undefined,
  };
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '\u2026' : text;
}

/** Convert a CourtListener docket entry to a ContentItem. */
export function toContentItem(doc: ClDocketEntry): ContentItem {
  const url = doc.absolute_url
    ? doc.absolute_url.startsWith('http')
      ? doc.absolute_url
      : `${CL_BASE_URL}${doc.absolute_url}`
    : undefined;

  return {
    title: doc.case_name || '(untitled case)',
    link: url,
    pubDate: doc.date_filed,
    agency: doc.court || 'Federal Court',
    summary: doc.description ? truncate(doc.description) : undefined,
    type: 'court_opinion',
    sourceOrigin: 'courtlistener',
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

function buildSearchUrl(params: { nos?: string; type?: string; query?: string }): string {
  const qs = new URLSearchParams();
  if (params.nos) qs.set('nature_of_suit', params.nos);
  if (params.type) qs.set('type', params.type);
  if (params.query) qs.set('q', params.query);
  qs.set('order_by', '-date_filed');
  return `${CL_API_V4}/search/?${qs.toString()}`;
}

/** Fetch recent CourtListener docket entries for the snapshot pipeline. */
export async function fetchCourtListenerRecent(params: {
  nos?: string;
  type?: string;
  query?: string;
}): Promise<ContentItem[]> {
  const url = buildSearchUrl(params);

  const response = await fetch(url, { headers: getAuthHeaders() });
  if (!response.ok) {
    console.error(`[courtlistener] HTTP ${response.status}`);
    return [];
  }

  const data: ClSearchResult = await response.json();
  return (data.results || []).slice(0, 20).map(toContentItem);
}

/** Fetch historical CourtListener entries for the backfill pipeline. */
export async function fetchCourtListenerHistorical(params: {
  nos?: string;
  type?: string;
  query?: string;
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
}): Promise<ContentItem[]> {
  const { dateFrom, dateTo, maxPages = 10 } = params;
  const allItems: ContentItem[] = [];

  const qs = new URLSearchParams();
  if (params.nos) qs.set('nature_of_suit', params.nos);
  if (params.type) qs.set('type', params.type);
  if (params.query) qs.set('q', params.query);
  qs.set('date_filed__gte', dateFrom);
  qs.set('date_filed__lte', dateTo);
  qs.set('order_by', '-date_filed');

  let url: string | null = `${CL_API_V4}/search/?${qs.toString()}`;
  let page = 0;

  while (url && page < maxPages) {
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) {
      console.error(`[courtlistener] HTTP ${response.status} on page ${page}`);
      break;
    }

    const data: ClSearchResult = await response.json();
    allItems.push(...(data.results || []).map(toContentItem));
    url = data.next || null;
    page++;

    if (url) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return allItems;
}
