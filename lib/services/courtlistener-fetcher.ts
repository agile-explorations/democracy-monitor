import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';
import { isSameHostHttps } from '@/lib/utils/pagination';

export const CL_BASE_URL = 'https://www.courtlistener.com';
export const CL_API_V4 = `${CL_BASE_URL}/api/rest/v4`;
export const RATE_LIMIT_DELAY_MS = 2000;
export const FETCH_TIMEOUT_MS = 30_000;
const MAX_SUMMARY_LENGTH = 800;
/** Default max pages for historical backfill (45 × 20 results/page = 900). */
export const CL_BACKFILL_MAX_PAGES = 45;

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
    content: summary ? truncate(summary) : undefined,
    type: 'court_opinion',
    sourceOrigin: 'courtlistener',
    metadata: {
      docketNumber: doc.docketNumber,
      suitNature: doc.suitNature,
      caseId: doc.docket_id ? `cl:${doc.docket_id}` : undefined,
    },
  };
}

/** Extract docket ID from a CourtListener docket URL. */
export function extractDocketId(url: string): number | null {
  const match = url.match(/\/docket\/(\d+)\//);
  return match ? parseInt(match[1], 10) : null;
}

/** CL opinion clusters API response shape. */
interface ClClusterResult {
  id?: number;
  case_name?: string;
  date_filed?: string;
  sub_opinions?: string[];
}

interface ClClusterResponse {
  results?: ClClusterResult[];
}

/** CL opinions API response shape. */
interface ClOpinionResult {
  id?: number;
  type?: string;
  plain_text?: string;
  absolute_url?: string;
}

/**
 * CL opinion type values that are purely procedural and should be excluded.
 * Everything else is treated as substantive judicial reasoning worth ingesting.
 * Excluded: addendum (supplementary), remittitur (damages reduction),
 * on-motion-to-strike (cost bill motions).
 */
export const PROCEDURAL_OPINION_TYPES = new Set([
  '050addendum',
  '060remittitur',
  '090onmotiontostrike',
]);

/** Human-readable label for opinion type codes, used as section separators. */
export const OPINION_TYPE_LABELS: Record<string, string> = {
  '010combined': 'OPINION',
  '015unamimous': 'UNANIMOUS OPINION',
  '020lead': 'LEAD OPINION',
  '025plurality': 'PLURALITY OPINION',
  '030concurrence': 'CONCURRENCE',
  '035concurrenceinpart': 'CONCURRENCE IN PART',
  '040dissent': 'DISSENT',
  '070rehearing': 'REHEARING',
  '080onthemerits': 'ON THE MERITS',
  '100trialcourt': 'TRIAL COURT OPINION',
};

export interface OpinionData {
  text: string;
  dateFiled: string;
  opinionUrl: string;
}

/** Extract opinion ID from a CL sub_opinions URL like "/api/rest/v4/opinions/12345/". */
function extractOpinionId(url: string): string | null {
  return url.match(/\/opinions\/(\d+)\//)?.[1] ?? null;
}

/** Fetch a single opinion's type, text, and URL. */
async function fetchSingleOpinion(
  opinionId: string,
): Promise<{ type: string; text: string; url: string } | null> {
  const apiUrl = `${CL_API_V4}/opinions/${opinionId}/?fields=plain_text,id,type,absolute_url`;
  const res = await fetchWithRetry(
    apiUrl,
    { headers: getAuthHeaders() },
    { label: 'cl-opinion', timeoutMs: FETCH_TIMEOUT_MS },
  );
  if (!res.ok) return null;

  const op: ClOpinionResult = await res.json();
  const text = op.plain_text?.replace(/\0/g, '');
  if (!text) return null;

  const url = op.absolute_url
    ? op.absolute_url.startsWith('http')
      ? op.absolute_url
      : `${CL_BASE_URL}${op.absolute_url}`
    : `${CL_BASE_URL}/opinion/${opinionId}/`;

  return { type: op.type ?? '010combined', text, url };
}

/**
 * Fetch each sub-opinion by ID, filter to substantive types, and concatenate
 * into a single OpinionData. Shared by docket-first (fetchOpinionText) and
 * opinion-first (cl-opinion-first-fetcher) paths so both emit an identical
 * opinionUrl — making re-storage an upsert on (url, category) rather than a
 * duplicate row.
 *
 * When a cluster has multiple sub_opinions, all substantive opinions (majority,
 * concurrence, dissent) are concatenated with type labels as separators, so the
 * full judicial reasoning is captured — a dissent may signal stronger erosion
 * concern than the majority opinion alone.
 *
 * Returns null if no substantive opinion text is found.
 */
export async function buildOpinionDataFromSubOpinions(
  opinionIds: string[],
  clusterDateFiled: string,
): Promise<OpinionData | null> {
  const opinions: { type: string; text: string; url: string }[] = [];
  for (const opId of opinionIds) {
    const op = await fetchSingleOpinion(opId);
    if (op && !PROCEDURAL_OPINION_TYPES.has(op.type)) {
      opinions.push(op);
    }
    if (opinionIds.length > 1) await sleep(RATE_LIMIT_DELAY_MS);
  }

  if (opinions.length === 0) return null;

  // Use the first opinion's URL as the canonical link.
  const opinionUrl = opinions[0].url;

  // Single opinion: use its text directly. Multiple: concatenate with labels.
  const text =
    opinions.length === 1
      ? opinions[0].text
      : opinions
          .map((op) => `[${OPINION_TYPE_LABELS[op.type] ?? op.type}]\n${op.text}`)
          .join('\n\n');

  return { text, dateFiled: clusterDateFiled, opinionUrl };
}

/**
 * Fetch the most recent opinion text for a given docket ID.
 * Uses a two-step approach: clusters endpoint (for date_filed) → opinions endpoint (for text).
 *
 * CL's opinion.date_created is a database timestamp; cluster.date_filed is the
 * actual opinion date. Returns null if no opinions found or on API error.
 */
export async function fetchOpinionText(docketId: number): Promise<OpinionData | null> {
  try {
    // Step 1: Find the most recent opinion cluster for this docket
    const clusterQs = new URLSearchParams({
      docket: String(docketId),
      fields: 'id,case_name,date_filed,sub_opinions',
      page_size: '1',
      order_by: '-date_filed',
    });
    const clusterUrl = `${CL_API_V4}/clusters/?${clusterQs.toString()}`;
    const clusterRes = await fetchWithRetry(
      clusterUrl,
      { headers: getAuthHeaders() },
      { label: 'cl-cluster', timeoutMs: FETCH_TIMEOUT_MS },
    );
    if (!clusterRes.ok) return null;

    const clusterData: ClClusterResponse = await clusterRes.json();
    const cluster = clusterData.results?.[0];
    if (!cluster?.date_filed || !cluster.sub_opinions?.length) return null;

    // Step 2: Fetch all sub_opinions, filter to substantive types, concatenate
    const opinionIds = cluster.sub_opinions
      .map(extractOpinionId)
      .filter((id): id is string => id !== null);
    return await buildOpinionDataFromSubOpinions(opinionIds, cluster.date_filed);
  } catch (err) {
    console.warn(`[courtlistener] fetchOpinionText(${docketId}) failed:`, err);
    return null;
  }
}

/** Build a ContentItem from an opinion API response and its parent docket. */
export function buildOpinionContentItem(
  opinion: OpinionData,
  parentDocket: {
    caseName: string;
    court: string;
    docketId: number;
    suitNature?: string;
    /** Which CL queries surfaced this opinion (provenance for audits/purges). */
    clQueries?: string[];
    /** CL cluster id (#741) — revisions get a new cluster; persisted for audits. */
    clusterId?: number;
  },
): ContentItem {
  return {
    title: parentDocket.caseName,
    content: opinion.text,
    link: opinion.opinionUrl,
    pubDate: opinion.dateFiled,
    agency: parentDocket.court,
    type: 'judicial_opinion',
    sourceOrigin: 'courtlistener',
    caseId: `cl:${parentDocket.docketId}`,
    metadata: {
      caseId: `cl:${parentDocket.docketId}`,
      suitNature: parentDocket.suitNature,
      parentDocketUrl: `${CL_BASE_URL}/docket/${parentDocket.docketId}/`,
      ...(parentDocket.clQueries?.length ? { clQueries: parentDocket.clQueries } : {}),
      ...(parentDocket.clusterId != null ? { clusterId: parentDocket.clusterId } : {}),
    },
  };
}

export function getAuthHeaders(): Record<string, string> {
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
    const response = await fetchWithRetry(
      url,
      { headers: getAuthHeaders() },
      { label: 'cl-search', timeoutMs: FETCH_TIMEOUT_MS },
    );
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
    const response = await fetchWithRetry(
      url,
      { headers: getAuthHeaders() },
      { label: 'cl-search-page', timeoutMs: FETCH_TIMEOUT_MS },
    );
    if (!response.ok) {
      if (page === 0) throw new Error(`[courtlistener] HTTP ${response.status} on page ${page}`);
      console.error(`[courtlistener] HTTP ${response.status} on page ${page}, returning partial`);
      break;
    }

    const data: ClSearchResult = await response.json();
    items.push(...(data.results || []).map(toContentItem));
    // Only follow the API-supplied next URL if it stays on the CourtListener
    // host over https (#630) — a tampered response can't redirect pagination.
    url = data.next && isSameHostHttps(data.next, CL_BASE_URL) ? data.next : null;
    if (data.next && !url) {
      console.warn(`[courtlistener] pagination halted — next URL off-host: ${data.next}`);
    }
    page++;

    if (url) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return items;
}

/** Fetch historical CourtListener entries for the backfill pipeline. */
export async function fetchCourtListenerHistorical(
  params: ClParams & { dateFrom: string; dateTo: string; maxPages?: number },
): Promise<ContentItem[]> {
  const { dateFrom, dateTo, maxPages = CL_BACKFILL_MAX_PAGES } = params;
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
