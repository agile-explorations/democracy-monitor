import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const FEC_API_BASE = 'https://api.open.fec.gov/v1';
const RATE_LIMIT_DELAY_MS = 4000; // FEC allows 1,000 req/hr with API key (~3.6s/req)
const RETRY_429_DELAY_MS = 60_000; // Wait 60s on rate limit before retry
const MAX_429_RETRIES = 3;
const MAX_SUMMARY_LENGTH = 800;

type FecEndpointType = 'advisory_opinions' | 'murs' | 'admin_fines';

interface FecAdvisoryOpinion {
  ao_no?: string;
  name?: string;
  summary?: string;
  issue_date?: string;
  status?: string;
  ao_citations?: Array<{ ao_no?: string }>;
}

interface FecMur {
  case_no?: string;
  name?: string;
  subject?: { primary?: string[]; secondary?: string[] };
  open_date?: string;
  close_date?: string;
  url?: string;
  respondents?: string[];
  commission_votes?: Array<{ action?: string; vote_date?: string }>;
}

interface FecLegalSearchResponse {
  advisory_opinions?: FecAdvisoryOpinion[];
  murs?: FecMur[];
  total_advisory_opinions?: number;
  total_murs?: number;
}

/**
 * Parse a fec:// pseudo-URL into API query parameters.
 * Format: fec://advisory-opinions?type=advisory_opinions
 */
export function parseFecParams(signalUrl: string): {
  endpointType: FecEndpointType;
} {
  const parsed = new URL(signalUrl.replace('fec://', 'http://fec/'));
  const type = (parsed.searchParams.get('type') || 'advisory_opinions') as FecEndpointType;
  return { endpointType: type };
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '\u2026' : text;
}

/** Convert an FEC advisory opinion to a ContentItem. */
export function aoToContentItem(ao: FecAdvisoryOpinion): ContentItem {
  return {
    title: ao.name || `Advisory Opinion ${ao.ao_no || '(unknown)'}`,
    link: ao.ao_no ? `https://www.fec.gov/data/legal/advisory-opinions/${ao.ao_no}/` : undefined,
    pubDate: ao.issue_date,
    agency: 'Federal Election Commission',
    summary: ao.summary ? truncate(ao.summary) : undefined,
    type: 'advisory_opinion',
    sourceOrigin: 'fec',
  };
}

/** Convert an FEC MUR (Matter Under Review) to a ContentItem. */
export function murToContentItem(mur: FecMur): ContentItem {
  const subjects = mur.subject?.primary?.join(', ') || '';
  const respondents = mur.respondents?.slice(0, 3).join(', ') || '';
  const summary = [subjects, respondents ? `Respondents: ${respondents}` : '']
    .filter(Boolean)
    .join('. ');

  return {
    title: mur.name || `MUR ${mur.case_no || '(unknown)'}`,
    link:
      mur.url ||
      (mur.case_no
        ? `https://www.fec.gov/data/legal/matter-under-review/${mur.case_no}/`
        : undefined),
    pubDate: mur.open_date,
    agency: 'Federal Election Commission',
    summary: summary ? truncate(summary) : undefined,
    type: 'enforcement_action',
    sourceOrigin: 'fec',
  };
}

function getApiKey(): string | undefined {
  return process.env.FEC_API_KEY;
}

function buildSearchUrl(
  apiKey: string,
  type: string,
  extraParams?: Record<string, string>,
): string {
  const qs = new URLSearchParams({ api_key: apiKey, type, per_page: '20', ...extraParams });
  return `${FEC_API_BASE}/legal/search/?${qs.toString()}`;
}

async function fetchWithRetry(url: string, label: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0 (backfill)' },
    });
    if (response.status !== 429) return response;
    if (attempt < MAX_429_RETRIES) {
      const wait = RETRY_429_DELAY_MS * (attempt + 1);
      console.log(
        `[fec] 429 on ${label}, waiting ${wait / 1000}s (attempt ${attempt + 1}/${MAX_429_RETRIES})`,
      );
      await sleep(wait);
    }
  }
  console.error(`[fec] 429 on ${label} after ${MAX_429_RETRIES} retries, giving up`);
  return null;
}

/** Fetch recent FEC data for the snapshot pipeline. */
export async function fetchFecRecent(params: {
  endpointType: FecEndpointType;
}): Promise<ContentItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[fec] FEC_API_KEY not set, skipping fetch');
    return [];
  }

  const url = buildSearchUrl(apiKey, params.endpointType);
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0' },
  });

  if (!response.ok) {
    console.error(`[fec] HTTP ${response.status}`);
    return [];
  }

  const data: FecLegalSearchResponse = await response.json();
  if (params.endpointType === 'advisory_opinions') {
    return (data.advisory_opinions || []).slice(0, 20).map(aoToContentItem);
  }
  return (data.murs || []).slice(0, 20).map(murToContentItem);
}

/** Fetch historical FEC data for the backfill pipeline. */
export async function fetchFecHistorical(params: {
  endpointType: FecEndpointType;
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
}): Promise<ContentItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[fec] FEC_API_KEY not set, skipping backfill');
    return [];
  }

  const { maxPages = 5 } = params;

  if (params.endpointType === 'advisory_opinions') {
    return fetchAoHistorical(apiKey, params.dateFrom, params.dateTo, maxPages);
  }
  return fetchMurHistorical(apiKey, params.dateFrom, params.dateTo, maxPages);
}

async function fetchAoHistorical(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  maxPages: number,
): Promise<ContentItem[]> {
  const allItems: ContentItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = buildSearchUrl(apiKey, 'advisory_opinions', {
      ao_min_issue_date: dateFrom,
      ao_max_issue_date: dateTo,
      per_page: '100',
    });

    await sleep(RATE_LIMIT_DELAY_MS);
    const response = await fetchWithRetry(url, `AO ${dateFrom}`);
    if (!response || !response.ok) {
      if (response) console.error(`[fec] HTTP ${response.status} on AO ${dateFrom}`);
      break;
    }

    const data: FecLegalSearchResponse = await response.json();
    const results = data.advisory_opinions || [];
    if (results.length === 0) break;

    allItems.push(...results.map(aoToContentItem));
    break; // legal/search doesn't support cursor pagination
  }

  return allItems;
}

async function fetchMurHistorical(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  maxPages: number,
): Promise<ContentItem[]> {
  const allItems: ContentItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = buildSearchUrl(apiKey, 'murs', {
      case_min_open_date: dateFrom,
      case_max_open_date: dateTo,
      per_page: '100',
    });

    await sleep(RATE_LIMIT_DELAY_MS);
    const response = await fetchWithRetry(url, `MUR ${dateFrom}`);
    if (!response || !response.ok) {
      if (response) console.error(`[fec] HTTP ${response.status} on MUR ${dateFrom}`);
      break;
    }

    const data: FecLegalSearchResponse = await response.json();
    const results = data.murs || [];
    if (results.length === 0) break;

    allItems.push(...results.map(murToContentItem));
    break; // legal/search doesn't support cursor pagination
  }

  return allItems;
}
