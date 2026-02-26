import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const DOJ_API_BASE = 'https://www.justice.gov/api/v1/press_releases.json';
const POLITENESS_DELAY_MS = 2000;
const MAX_SUMMARY_LENGTH = 800;

interface DojNamedRef {
  uuid: string;
  name: string;
}

interface DojPressRelease {
  uuid?: string;
  title?: string;
  body?: string;
  teaser?: string;
  date?: string;
  changed?: string;
  created?: string;
  component?: DojNamedRef[];
  topic?: DojNamedRef[];
  url?: string;
  number?: string;
}

interface DojApiResponse {
  results?: DojPressRelease[];
  metadata?: { resultset?: { count: string; pagesize: number; page: number } };
}

/**
 * Parse a DOJ signal URL to extract component/topic filters.
 * Format: doj://press?component=criminal-division&topic=civil+rights
 */
export function parseDojSignalParams(signalUrl: string): {
  component?: string;
  topic?: string;
} {
  const parsed = new URL(signalUrl.replace('doj://', 'http://doj/'));
  return {
    component: parsed.searchParams.get('component') || undefined,
    topic: parsed.searchParams.get('topic') || undefined,
  };
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '\u2026' : text;
}

/** Minimal HTML tag stripper for DOJ body text. */
function stripHtmlBasic(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Convert a DOJ press release to a ContentItem. */
export function toContentItem(release: DojPressRelease): ContentItem {
  const fullUrl = release.url
    ? release.url.startsWith('http')
      ? release.url
      : `https://www.justice.gov${release.url}`
    : undefined;

  const rawTitle = release.title ? stripHtmlBasic(release.title) : '(untitled release)';

  const pubDate = release.date ? new Date(parseInt(release.date) * 1000).toISOString() : undefined;

  const agency = release.component?.[0]?.name || 'Department of Justice';

  const bodyText = release.teaser || release.body;
  const summary = bodyText ? truncate(stripHtmlBasic(bodyText)) : undefined;

  return {
    title: rawTitle,
    link: fullUrl,
    pubDate,
    agency,
    summary,
    type: 'press_release',
    sourceOrigin: 'doj',
  };
}

/**
 * Check if a release's components match a signal slug.
 * Converts slug (e.g., "criminal-division") to pattern ("criminal division"),
 * then checks if any component name contains it (case-insensitive).
 * If slug is undefined, matches all releases (no filter).
 */
export function matchesComponentSlug(
  components: DojNamedRef[] | undefined,
  slug: string | undefined,
): boolean {
  if (!slug) return true;
  if (!components || components.length === 0) return false;
  const pattern = slug.replace(/-/g, ' ').toLowerCase();
  return components.some((c) => c.name.toLowerCase().includes(pattern));
}

/** Parse Set-Cookie header into a cookie string for subsequent requests. */
function parseCookies(setCookieHeader: string | null): string {
  if (!setCookieHeader) return '';
  return setCookieHeader
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .join('; ');
}

/** Parse Unix timestamp string to Date, or null if missing. */
function parseUnixDate(timestamp: string | undefined): Date | null {
  if (!timestamp) return null;
  return new Date(parseInt(timestamp) * 1000);
}

/** Check if more pages remain based on API metadata. */
function hasMorePages(metadata: DojApiResponse['metadata'], currentPage: number): boolean {
  const resultset = metadata?.resultset;
  if (!resultset) return false;
  const totalPages = Math.ceil(parseInt(resultset.count) / resultset.pagesize);
  return currentPage < totalPages - 1;
}

function buildDojUrl(params: { page?: number }): string {
  const qs = new URLSearchParams();
  qs.set('sort_order', 'DESC');
  qs.set('pagesize', '50');
  if (params.page) qs.set('page', String(params.page));
  return `${DOJ_API_BASE}?${qs.toString()}`;
}

/** Fetch recent DOJ press releases for the snapshot pipeline. */
export async function fetchDojRecent(params: {
  component?: string;
  topic?: string;
}): Promise<ContentItem[]> {
  const url = buildDojUrl({});

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DemocracyMonitor/1.0',
    },
  });

  if (!response.ok) {
    console.error(`[doj] HTTP ${response.status}`);
    return [];
  }

  const data: DojApiResponse = await response.json();
  const releases = data.results || [];

  const filtered = releases.filter((r) => matchesComponentSlug(r.component, params.component));

  return filtered.slice(0, 20).map(toContentItem);
}

/** Fetch historical DOJ press releases for the backfill pipeline. */
export async function fetchDojHistorical(params: {
  component?: string;
  topic?: string;
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
}): Promise<ContentItem[]> {
  const { maxPages = 10 } = params;
  const allItems: ContentItem[] = [];
  const fromDate = new Date(params.dateFrom);
  const toDate = new Date(params.dateTo);
  let cookies = '';

  for (let page = 0; page < maxPages; page++) {
    const url = buildDojUrl({ page });
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'DemocracyMonitor/1.0 (backfill)',
    };
    if (cookies) headers['Cookie'] = cookies;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.error(`[doj] HTTP ${response.status} on page ${page}`);
      break;
    }

    cookies = parseCookies(response.headers.get('set-cookie')) || cookies;

    const data: DojApiResponse = await response.json();
    const releases = data.results || [];
    if (releases.length === 0) break;

    const filtered = releases.filter((r) => {
      if (!matchesComponentSlug(r.component, params.component)) return false;
      const d = parseUnixDate(r.date);
      return d && d >= fromDate && d <= toDate;
    });
    allItems.push(...filtered.map(toContentItem));

    // With DESC sort, stop when last item's date is before our range
    const lastDate = parseUnixDate(releases[releases.length - 1]?.date);
    if (lastDate && lastDate < fromDate) break;

    if (!hasMorePages(data.metadata, page)) break;
    await sleep(POLITENESS_DELAY_MS);
  }

  return allItems;
}
