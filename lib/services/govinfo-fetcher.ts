import { stripHtml } from '@/lib/parsers/feed-parser';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { toDateString } from '@/lib/utils/date-utils';

const GOVINFO_API_BASE = 'https://api.govinfo.gov';
const RATE_LIMIT_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_SUMMARY_LENGTH = 800;
const MAX_CONTENT_LENGTH = 8_000;

/** Collection codes supported by the GovInfo fetcher. */
type GovInfoCollection = 'GAOREPORTS' | 'CRPT' | 'PLAW';

/** Result from the GovInfo search POST endpoint. */
interface GovInfoSearchResult {
  packageId?: string;
  title?: string;
  dateIssued?: string;
  collectionCode?: string;
  governmentAuthor?: string[];
  download?: { txtLink?: string; pdfLink?: string };
  resultLink?: string;
}

interface GovInfoSearchResponse {
  results?: GovInfoSearchResult[];
  count?: number;
  offsetMark?: string | null;
}

/** @deprecated Collections GET response — kept for toContentItem backward compat. */
interface GovInfoPackage {
  packageId?: string;
  title?: string;
  dateIssued?: string;
  packageLink?: string;
  docClass?: string;
  category?: string;
}

/** @deprecated Summary type — kept for toContentItem backward compat. */
interface GovInfoSummary {
  title?: string;
  collectionCode?: string;
  category?: string;
  dateIssued?: string;
  abstract?: string;
  download?: { txtLink?: string; pdfLink?: string };
}

/**
 * Parse a govinfo:// pseudo-URL into API query parameters.
 * Format: govinfo://collection?collection=GAOREPORTS&offset=0
 */
export function parseGovInfoParams(signalUrl: string): {
  collection: GovInfoCollection;
  offset?: number;
} {
  const parsed = new URL(signalUrl.replace('govinfo://', 'http://gi/'));
  const collection = (parsed.searchParams.get('collection') || 'GAOREPORTS') as GovInfoCollection;
  const offsetStr = parsed.searchParams.get('offset');
  return {
    collection,
    offset: offsetStr ? parseInt(offsetStr, 10) : undefined,
  };
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '\u2026' : text;
}

function mapCollectionToDocType(collection: string): string {
  switch (collection) {
    case 'GAOREPORTS':
      return 'gao_report';
    case 'CRPT':
      return 'congressional_report';
    case 'PLAW':
      return 'public_law';
    default:
      return 'report';
  }
}

/** Convert a GovInfo search result to a ContentItem. */
export function searchResultToContentItem(result: GovInfoSearchResult): ContentItem {
  const collection = result.collectionCode || 'CRPT';
  const url =
    result.download?.pdfLink ||
    result.download?.txtLink ||
    `https://www.govinfo.gov/app/details/${result.packageId}`;

  return {
    title: result.title || '(untitled document)',
    link: url,
    pubDate: result.dateIssued,
    agency: result.governmentAuthor?.[0] || 'U.S. Government',
    type: mapCollectionToDocType(collection),
    sourceOrigin: 'govinfo',
    metadata: { packageId: result.packageId, collectionCode: collection },
  };
}

/** @deprecated Convert a GovInfo collections package to ContentItem. Use searchResultToContentItem. */
export function toContentItem(
  pkg: GovInfoPackage,
  collection: string,
  summary?: GovInfoSummary,
): ContentItem {
  const url = summary?.download?.pdfLink || `https://www.govinfo.gov/app/details/${pkg.packageId}`;

  return {
    title: pkg.title || summary?.title || '(untitled document)',
    link: url,
    pubDate: pkg.dateIssued || summary?.dateIssued,
    agency: summary?.category || pkg.docClass || 'Government Accountability Office',
    summary: summary?.abstract ? truncate(summary.abstract) : undefined,
    type: mapCollectionToDocType(collection),
    sourceOrigin: 'govinfo',
  };
}

function getApiKey(): string | undefined {
  return process.env.GOVINFO_API_KEY;
}

/** Execute a GovInfo search POST request with cursor-based pagination. */
async function searchGovInfo(
  query: string,
  apiKey: string,
  pageSize: number,
  offsetMark: string,
): Promise<GovInfoSearchResponse> {
  const response = await fetch(`${GOVINFO_API_BASE}/search?api_key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'DemocracyMonitor/1.0',
    },
    body: JSON.stringify({
      query,
      pageSize: String(pageSize),
      offsetMark,
      sorts: [{ field: 'publishdate', sortOrder: 'ASC' }],
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.error(`[govinfo] Search HTTP ${response.status}`);
    return { results: [], count: 0, offsetMark: null };
  }

  return response.json();
}

/**
 * Fetch the full HTML text for a GovInfo package and return stripped plaintext.
 * Used for Congressional Reports where the search result has no summary.
 * Tries package-level /htm first; falls back to granule-level /htm for older reports.
 */
export async function fetchGovInfoText(packageId: string): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const html = await fetchPackageHtml(packageId, apiKey);
    if (!html) return null;
    const text = stripHtml(html).replace(/\0/g, '').trim();
    return text.length > MAX_CONTENT_LENGTH
      ? text.slice(0, MAX_CONTENT_LENGTH) + '\u2026'
      : text || null;
  } catch (err) {
    console.warn(`[govinfo-fetcher] Failed to fetch text for package ${packageId}:`, err);
    return null;
  }
}

async function fetchPackageHtml(packageId: string, apiKey: string): Promise<string | null> {
  // Try package-level HTML first (works for newer reports)
  const pkgUrl = `${GOVINFO_API_BASE}/packages/${packageId}/htm?api_key=${apiKey}`;
  const pkgResponse = await fetch(pkgUrl, {
    headers: { 'User-Agent': 'DemocracyMonitor/1.0 (content-backfill)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (pkgResponse.ok) return pkgResponse.text();

  // Fall back to granule-level HTML (older congressional reports)
  const granulesUrl = `${GOVINFO_API_BASE}/packages/${packageId}/granules?offsetMark=*&pageSize=1&api_key=${apiKey}`;
  const granulesResponse = await fetch(granulesUrl, {
    headers: { 'User-Agent': 'DemocracyMonitor/1.0 (content-backfill)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!granulesResponse.ok) return null;

  const granulesData = (await granulesResponse.json()) as {
    granules?: { granuleId?: string }[];
  };
  const granuleId = granulesData.granules?.[0]?.granuleId;
  if (!granuleId) return null;

  const granuleUrl = `${GOVINFO_API_BASE}/packages/${packageId}/granules/${granuleId}/htm?api_key=${apiKey}`;
  const granuleResponse = await fetch(granuleUrl, {
    headers: { 'User-Agent': 'DemocracyMonitor/1.0 (content-backfill)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!granuleResponse.ok) return null;
  return granuleResponse.text();
}

/** Fetch recent GovInfo documents for the snapshot pipeline. */
export async function fetchGovInfoRecent(params: {
  collection: GovInfoCollection;
  offset?: number;
}): Promise<ContentItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[govinfo] GOVINFO_API_KEY not set, skipping fetch');
    return [];
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startDate = toDateString(sevenDaysAgo);
  const query = `collection:${params.collection} publishdate:range(${startDate},)`;

  const data = await searchGovInfo(query, apiKey, 20, '*');
  return (data.results || []).slice(0, 20).map(searchResultToContentItem);
}

/** Fetch historical GovInfo documents for the backfill pipeline. */
export async function fetchGovInfoHistorical(params: {
  collection: GovInfoCollection;
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
}): Promise<ContentItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[govinfo] GOVINFO_API_KEY not set, skipping backfill');
    return [];
  }

  const { dateFrom, dateTo, maxPages = 10 } = params;
  const query = `collection:${params.collection} publishdate:range(${dateFrom},${dateTo})`;
  const allItems: ContentItem[] = [];
  const pageSize = 100;
  let offsetMark = '*';

  for (let page = 0; page < maxPages; page++) {
    const data = await searchGovInfo(query, apiKey, pageSize, offsetMark);
    const results = data.results || [];
    if (results.length === 0) break;

    allItems.push(...results.map(searchResultToContentItem));

    if (!data.offsetMark || results.length < pageSize) break;
    offsetMark = data.offsetMark;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return allItems;
}
