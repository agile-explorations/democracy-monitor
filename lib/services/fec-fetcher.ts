import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const FEC_API_BASE = 'https://api.open.fec.gov/v1';
const RATE_LIMIT_DELAY_MS = 200;
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

interface FecApiResponse<T> {
  results?: T[];
  pagination?: {
    pages?: number;
    page?: number;
    per_page?: number;
    count?: number;
  };
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
    link: mur.url || (mur.case_no ? `https://www.fec.gov/data/legal/matter-under-review/${mur.case_no}/` : undefined),
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

function buildFecUrl(endpoint: string, apiKey: string, extraParams?: Record<string, string>): string {
  const qs = new URLSearchParams({ api_key: apiKey, per_page: '20', ...extraParams });
  return `${FEC_API_BASE}/${endpoint}?${qs.toString()}`;
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

  if (params.endpointType === 'advisory_opinions') {
    return fetchAdvisoryOpinions(apiKey);
  }
  return fetchMurs(apiKey);
}

async function fetchAdvisoryOpinions(apiKey: string): Promise<ContentItem[]> {
  const url = buildFecUrl('legal/advisory_opinions/', apiKey, {
    sort: '-issue_date',
  });

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0' },
  });

  if (!response.ok) {
    console.error(`[fec] HTTP ${response.status}`);
    return [];
  }

  const data: FecApiResponse<FecAdvisoryOpinion> = await response.json();
  return (data.results || []).slice(0, 20).map(aoToContentItem);
}

async function fetchMurs(apiKey: string): Promise<ContentItem[]> {
  const url = buildFecUrl('legal/murs/', apiKey, {
    sort: '-open_date',
  });

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0' },
  });

  if (!response.ok) {
    console.error(`[fec] HTTP ${response.status}`);
    return [];
  }

  const data: FecApiResponse<FecMur> = await response.json();
  return (data.results || []).slice(0, 20).map(murToContentItem);
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
  const fromDate = new Date(params.dateFrom);
  const toDate = new Date(params.dateTo);

  if (params.endpointType === 'advisory_opinions') {
    return fetchAoHistorical(apiKey, fromDate, toDate, maxPages);
  }
  return fetchMurHistorical(apiKey, fromDate, toDate, maxPages);
}

async function fetchAoHistorical(
  apiKey: string,
  fromDate: Date,
  toDate: Date,
  maxPages: number,
): Promise<ContentItem[]> {
  const allItems: ContentItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = buildFecUrl('legal/advisory_opinions/', apiKey, {
      sort: '-issue_date',
      page: String(page),
    });

    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0 (backfill)' },
    });

    if (!response.ok) {
      console.error(`[fec] HTTP ${response.status} on page ${page}`);
      break;
    }

    const data: FecApiResponse<FecAdvisoryOpinion> = await response.json();
    const results = data.results || [];
    if (results.length === 0) break;

    const filtered = results.filter((ao) => {
      const d = ao.issue_date ? new Date(ao.issue_date) : null;
      return d && d >= fromDate && d <= toDate;
    });

    allItems.push(...filtered.map(aoToContentItem));

    const lastDate = results[results.length - 1]?.issue_date;
    if (lastDate && new Date(lastDate) < fromDate) break;

    if (!data.pagination?.pages || page >= data.pagination.pages) break;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return allItems;
}

async function fetchMurHistorical(
  apiKey: string,
  fromDate: Date,
  toDate: Date,
  maxPages: number,
): Promise<ContentItem[]> {
  const allItems: ContentItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = buildFecUrl('legal/murs/', apiKey, {
      sort: '-open_date',
      page: String(page),
    });

    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0 (backfill)' },
    });

    if (!response.ok) {
      console.error(`[fec] HTTP ${response.status} on page ${page}`);
      break;
    }

    const data: FecApiResponse<FecMur> = await response.json();
    const results = data.results || [];
    if (results.length === 0) break;

    const filtered = results.filter((mur) => {
      const d = mur.open_date ? new Date(mur.open_date) : null;
      return d && d >= fromDate && d <= toDate;
    });

    allItems.push(...filtered.map(murToContentItem));

    const lastDate = results[results.length - 1]?.open_date;
    if (lastDate && new Date(lastDate) < fromDate) break;

    if (!data.pagination?.pages || page >= data.pagination.pages) break;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return allItems;
}
