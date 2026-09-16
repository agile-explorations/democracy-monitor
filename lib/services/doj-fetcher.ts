import { componentNameMatchesSlug, isCorpusComponent } from '@/lib/data/doj-corpus-components';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const DOJ_API_BASE = 'https://www.justice.gov/api/v1/press_releases.json';
const POLITENESS_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 50;
interface DojNamedRef {
  uuid: string;
  name: string;
}

export interface DojPressRelease {
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

export interface DojApiResponse {
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

/** Strip HTML and clean DOJ body text. */

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

  const bodyText = release.body || release.teaser;
  const summary = bodyText ? stripHtmlBasic(bodyText) : undefined;

  return {
    title: rawTitle,
    link: fullUrl,
    pubDate,
    agency,
    content: summary,
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
  return components.some((c) => componentNameMatchesSlug(c.name, slug));
}

/** Routed vs. corpus-only releases from one historical DOJ fetch (#892). */
export interface DojHistoricalResult {
  /** Releases matching the signal's component filter — detection evidence. */
  items: ContentItem[];
  /** Releases that failed the signal filter but come from a corpus component
   *  (AG, Deputy AG, Public Affairs, or a signal division): stored for search
   *  only, never scored. */
  excludedItems: ContentItem[];
}

/**
 * Sort one API page's releases into routed / corpus-only / discarded for a
 * signal. Pure — the date window is applied first so neither bucket ever
 * carries an out-of-range release.
 */
export function partitionReleases(
  releases: DojPressRelease[],
  params: { component?: string; fromDate: Date; toDate: Date },
): DojHistoricalResult {
  const items: ContentItem[] = [];
  const excludedItems: ContentItem[] = [];
  for (const release of releases) {
    const d = parseUnixDate(release.date);
    if (!d || d < params.fromDate || d > params.toDate) continue;
    if (matchesComponentSlug(release.component, params.component)) {
      items.push(toContentItem(release));
    } else if (isCorpusComponent((release.component ?? []).map((c) => c.name))) {
      excludedItems.push(toContentItem(release));
    }
  }
  return { items, excludedItems };
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

function buildDojUrl(page: number): string {
  const qs = new URLSearchParams();
  qs.set('sort_order', 'DESC');
  qs.set('pagesize', String(PAGE_SIZE));
  if (page > 0) qs.set('page', String(page));
  return `${DOJ_API_BASE}?${qs.toString()}`;
}

/** Fetch a single page from the DOJ API, returning parsed data and updated cookies. */
export async function fetchDojPage(
  page: number,
  cookies: string,
): Promise<{ data: DojApiResponse; cookies: string } | null> {
  const url = buildDojUrl(page);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'DemocracyMonitor/1.0 (backfill)',
  };
  if (cookies) headers['Cookie'] = cookies;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`[doj] HTTP ${response.status} on page ${page}`);
  }

  const newCookies = parseCookies(response.headers.get('set-cookie')) || cookies;
  const data: DojApiResponse = await response.json();
  return { data, cookies: newCookies };
}

/** Get the first release date on a given page (DESC order = newest first). */
function firstDateOnPage(results: DojPressRelease[]): Date | null {
  return results.length > 0 ? parseUnixDate(results[0].date) : null;
}

/**
 * Binary search for the page where `targetDate` first appears.
 * Results are DESC-sorted, so higher page numbers = older dates.
 * Returns the page number where results are at or just after targetDate.
 */
export async function findStartPage(targetDate: Date, totalPages: number): Promise<number> {
  let lo = 0;
  let hi = totalPages - 1;
  let cookies = '';

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    await sleep(POLITENESS_DELAY_MS);
    const result = await fetchDojPage(mid, cookies);
    if (!result) return lo;

    cookies = result.cookies;
    const pageDate = firstDateOnPage(result.data.results || []);
    if (!pageDate) return lo;

    // If the first item on this page is newer than target, we need a higher page (older dates)
    if (pageDate > targetDate) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** Fetch recent DOJ press releases for the snapshot pipeline. */
export async function fetchDojRecent(params: {
  component?: string;
  topic?: string;
}): Promise<ContentItem[]> {
  const url = buildDojUrl(0);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DemocracyMonitor/1.0',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

interface DojHistoricalParams {
  component?: string;
  topic?: string;
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
}

/**
 * Fetch historical DOJ press releases for the backfill pipeline, returning
 * the signal-routed releases AND the corpus-only releases the signal filter
 * rejected (#892), so leadership-office releases reach search. Routed-item
 * behavior is unchanged from the former `fetchDojHistorical`.
 */
export async function fetchDojHistoricalPartitioned(
  params: DojHistoricalParams,
): Promise<DojHistoricalResult> {
  const { maxPages = 50 } = params;
  const fromDate = new Date(params.dateFrom);
  const toDate = new Date(params.dateTo);
  const empty: DojHistoricalResult = { items: [], excludedItems: [] };

  // Fetch page 0 to get total count for binary search
  const initial = await fetchDojPage(0, '');
  if (!initial) return empty;

  const totalCount = parseInt(initial.data.metadata?.resultset?.count || '0');
  if (totalCount === 0) return empty;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Binary search for the page containing dateTo (start of our range in DESC order)
  console.log(`  [doj] Binary searching ${totalPages} pages for ${params.dateTo}...`);
  // Start one page earlier: the binary search finds the first page whose newest item
  // is <= toDate, but the previous page's tail items may also be in range.
  const rawStart = await findStartPage(toDate, totalPages);
  const startPage = Math.max(0, rawStart - 1);
  console.log(`  [doj] Starting at page ${startPage}`);

  // Paginate forward from startPage (increasing page = older dates)
  const allItems: ContentItem[] = [];
  const excludedItems: ContentItem[] = [];
  let { cookies } = initial;

  for (let i = 0; i < maxPages; i++) {
    const page = startPage + i;
    if (page >= totalPages) break;

    await sleep(POLITENESS_DELAY_MS);
    const result = await fetchDojPage(page, cookies);
    if (!result) break;

    cookies = result.cookies;
    const releases = result.data.results || [];
    if (releases.length === 0) break;

    const split = partitionReleases(releases, { component: params.component, fromDate, toDate });
    allItems.push(...split.items);
    excludedItems.push(...split.excludedItems);

    // With DESC sort, stop when last item's date is before our range
    const lastDate = parseUnixDate(releases[releases.length - 1]?.date);
    if (lastDate && lastDate < fromDate) break;
  }

  console.log(
    `  [doj] Found ${allItems.length} items in range (${excludedItems.length} corpus-only)`,
  );
  return { items: allItems, excludedItems };
}
