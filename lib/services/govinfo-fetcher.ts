import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const GOVINFO_API_BASE = 'https://api.govinfo.gov';
const RATE_LIMIT_DELAY_MS = 100;
const MAX_SUMMARY_LENGTH = 800;

/** Collection codes supported by the GovInfo fetcher. */
type GovInfoCollection = 'GAOREPORTS' | 'CRPT' | 'PLAW';

interface GovInfoPackage {
  packageId?: string;
  title?: string;
  dateIssued?: string;
  packageLink?: string;
  docClass?: string;
  category?: string;
}

interface GovInfoCollectionResponse {
  packages?: GovInfoPackage[];
  nextPage?: string;
  count?: number;
}

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

/** Convert a GovInfo package to a ContentItem. */
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

function toIsoDatetime(dateStr: string): string {
  return dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00Z`;
}

function buildCollectionUrl(
  collection: string,
  startDate: string,
  pageSize: number,
  offset: number,
  apiKey: string,
): string {
  const isoDate = toIsoDatetime(startDate);
  return `${GOVINFO_API_BASE}/collections/${collection}/${isoDate}?offset=${offset}&pageSize=${pageSize}&api_key=${apiKey}`;
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
  const startDate = sevenDaysAgo.toISOString().split('T')[0];

  const url = buildCollectionUrl(params.collection, startDate, 20, params.offset ?? 0, apiKey);

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0' },
  });

  if (!response.ok) {
    console.error(`[govinfo] HTTP ${response.status}`);
    return [];
  }

  const data: GovInfoCollectionResponse = await response.json();
  return (data.packages || []).slice(0, 20).map((pkg) => toContentItem(pkg, params.collection));
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

  const { dateFrom, maxPages = 5 } = params;
  const allItems: ContentItem[] = [];
  const toDate = new Date(params.dateTo);
  const pageSize = 100;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const url = buildCollectionUrl(params.collection, dateFrom, pageSize, offset, apiKey);

    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0 (backfill)' },
    });

    if (!response.ok) {
      console.error(`[govinfo] HTTP ${response.status} on page ${page}`);
      break;
    }

    const data: GovInfoCollectionResponse = await response.json();
    const packages = data.packages || [];
    if (packages.length === 0) break;

    const filtered = packages.filter((pkg) => {
      const d = pkg.dateIssued ? new Date(pkg.dateIssued) : null;
      return d && d <= toDate;
    });

    allItems.push(...filtered.map((pkg) => toContentItem(pkg, params.collection)));

    if (packages.length < pageSize) break;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return allItems;
}
