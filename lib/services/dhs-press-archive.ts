import { sleep } from '@/lib/utils/async';
import { cbpUrlClass, isLocalMediaRelease, parseDhsListingPage } from './dhs-press-parsers';
import type { PressListingItem } from './dhs-press-parsers';

/**
 * Baseline-period enumeration for the DHS/ICE/CBP press source (#605).
 *
 * All three live newsroom listings were purged to inauguration day 2025, so
 * pre-2025 releases are recovered through side channels:
 * - DHS: the /archive/news subsite (press-release facet 436, dates in URL paths)
 * - ICE/CBP: sitemap.xml still enumerates delisted-but-live release URLs;
 *   sitemaps carry no dates, so Wayback CDX first-capture timestamps provide a
 *   date HINT to pick candidates, and the on-page date decides after fetch.
 */

const FETCH_TIMEOUT_MS = 45_000;
const SITEMAP_DELAY_MS = 2_000;
const CDX_DELAY_MS = 3_000;
const MAX_SITEMAP_PAGES = 40;
const MAX_ARCHIVE_PAGES = 500;
// Live-measured 2026-08-07: limit=20000 504s at the CDX gateway (~60s);
// limit=3000 answers in ~25s. ~15k ICE URLs → ~6 requests.
const CDX_PAGE_LIMIT = 3_000;
const CDX_TIMEOUT_MS = 120_000;
const MAX_CDX_REQUESTS = 60;

/** Capture-date safety buffer: releases are normally crawled within days of publication. */
export const CDX_BUFFER_DAYS = 60;

export const DHS_ARCHIVE_PRESS_PATH = '/archive/news?field_news_type_target_id=436';

const FETCH_MAX_ATTEMPTS = 3;
const FETCH_RETRY_BASE_MS = 5_000;

/** Fetch with linear-backoff retries — enumeration endpoints throw transient
 * connect timeouts (observed live: undici UND_ERR_CONNECT_TIMEOUT on a host
 * that answers in <100ms moments later). */
async function fetchText(
  url: string,
  accept: string,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)', Accept: accept },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`[dhs-press-archive] HTTP ${response.status} for ${url}`);
      return response.text();
    } catch (err) {
      if (attempt >= FETCH_MAX_ATTEMPTS) throw err;
      const delay = FETCH_RETRY_BASE_MS * attempt;
      console.warn(
        `[dhs-press-archive] attempt ${attempt}/${FETCH_MAX_ATTEMPTS} failed for ${url} (${err}), retrying in ${delay / 1000}s`,
      );
      await sleep(delay);
    }
  }
}

/** Extract <loc> URLs from a sitemap page (pure). */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

/** ICE press-release URLs from a sitemap URL list (pure). */
export function filterIcePressUrls(urls: string[]): string[] {
  return urls.filter((u) => /^https:\/\/www\.ice\.gov\/news\/releases\/[^/?#]+$/.test(u));
}

/** CBP press-release URLs (national scope drops local-media-release) (pure). */
export function filterCbpPressUrls(urls: string[], scope?: 'national'): string[] {
  return urls.filter((u) => {
    if (!u.startsWith('https://www.cbp.gov/')) return false;
    if (cbpUrlClass(u) === null) return false;
    return scope === 'national' ? !isLocalMediaRelease(u) : true;
  });
}

export interface CdxCapture {
  url: string;
  /** First-capture timestamp, YYYYMMDDhhmmss. */
  timestamp: string;
}

/**
 * Parse a CDX text response (fl=original,timestamp, showResumeKey=true).
 * The resume key, when present, follows a blank line after the data rows (pure).
 */
export function parseCdxResponse(text: string): {
  captures: CdxCapture[];
  resumeKey: string | null;
} {
  const lines = text.split('\n');
  const captures: CdxCapture[] = [];
  let resumeKey: string | null = null;
  let sawBlank = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (captures.length > 0) sawBlank = true;
      continue;
    }
    if (sawBlank) {
      resumeKey = trimmed;
      break;
    }
    const [original, timestamp] = trimmed.split(/\s+/);
    if (original && /^\d{14}$/.test(timestamp ?? '')) captures.push({ url: original, timestamp });
  }
  return { captures, resumeKey };
}

/** Normalize a CDX 'original' URL to its canonical live form (https, no query) (pure). */
export function normalizeCdxUrl(url: string): string {
  return url.replace(/^http:\/\//, 'https://').split('?')[0];
}

/**
 * Pick candidate URLs whose first capture falls within [dateFrom, dateTo +
 * bufferDays]. URLs absent from the capture map have no date hint and are
 * returned separately — the caller decides whether to fetch them (pure).
 */
export function bucketUrlsByPeriod(
  urls: string[],
  firstCaptures: Map<string, string>,
  dateFrom: string,
  dateTo: string,
  bufferDays: number = CDX_BUFFER_DAYS,
): { candidates: string[]; unknown: string[] } {
  const from = dateFrom.replace(/-/g, '');
  const toDate = new Date(`${dateTo}T00:00:00Z`);
  toDate.setUTCDate(toDate.getUTCDate() + bufferDays);
  const to = toDate.toISOString().slice(0, 10).replace(/-/g, '');

  const candidates: string[] = [];
  const unknown: string[] = [];
  for (const url of urls) {
    const ts = firstCaptures.get(url)?.slice(0, 8);
    if (!ts) unknown.push(url);
    else if (ts >= from && ts <= to) candidates.push(url);
  }
  return { candidates, unknown };
}

/** Walk a host's sitemap index pages and collect every <loc> URL. */
export async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  for (let page = 1; page <= MAX_SITEMAP_PAGES; page++) {
    if (page > 1) await sleep(SITEMAP_DELAY_MS);
    const xml = await fetchText(`${baseUrl}/sitemap.xml?page=${page}`, 'application/xml');
    const locs = parseSitemapLocs(xml).filter((u) => !u.includes('sitemap.xml'));
    if (locs.length === 0) break;
    urls.push(...locs);
  }
  return urls;
}

/**
 * Fetch first-capture timestamps for a URL prefix from the Wayback CDX API,
 * following resume keys. Returns a map of normalized URL → first-capture
 * timestamp (earliest wins across duplicates).
 */
export async function fetchCdxFirstCaptures(urlPrefix: string): Promise<Map<string, string>> {
  const captures = new Map<string, string>();
  let resumeKey: string | null = null;
  for (let request = 0; request < MAX_CDX_REQUESTS; request++) {
    if (request > 0) await sleep(CDX_DELAY_MS);
    const params = new URLSearchParams({
      url: `${urlPrefix}*`,
      filter: 'statuscode:200',
      collapse: 'urlkey',
      fl: 'original,timestamp',
      limit: String(CDX_PAGE_LIMIT),
      showResumeKey: 'true',
    });
    if (resumeKey) params.set('resumeKey', resumeKey);
    const text = await fetchText(
      `https://web.archive.org/cdx/search/cdx?${params.toString()}`,
      'text/plain',
      CDX_TIMEOUT_MS,
    );
    const parsed = parseCdxResponse(text);
    for (const capture of parsed.captures) {
      const url = normalizeCdxUrl(capture.url);
      const existing = captures.get(url);
      if (!existing || capture.timestamp < existing) captures.set(url, capture.timestamp);
    }
    resumeKey = parsed.resumeKey;
    if (!resumeKey) break;
  }
  return captures;
}

/** Fetch and parse one page of the DHS /archive/news press-release facet. */
export async function fetchDhsArchivePage(page: number): Promise<PressListingItem[]> {
  const url = `https://www.dhs.gov${DHS_ARCHIVE_PRESS_PATH}&page=${page}`;
  return parseDhsListingPage(await fetchText(url, 'text/html'));
}

/**
 * Walk the DHS /archive/news press-release facet for [dateFrom, dateTo].
 * Archive listing items carry their date in the URL path, so the range filter
 * needs no detail fetches; the walk stops once a whole page predates dateFrom.
 */
export async function enumerateDhsArchivePress(
  dateFrom: string,
  dateTo: string,
): Promise<PressListingItem[]> {
  const inRange: PressListingItem[] = [];
  for (let page = 0; page < MAX_ARCHIVE_PAGES; page++) {
    if (page > 0) await sleep(SITEMAP_DELAY_MS);
    const items = await fetchDhsArchivePage(page);
    if (items.length === 0) break;

    const dated = items.filter((i) => i.publishedAt !== null);
    inRange.push(...dated.filter((i) => i.publishedAt! >= dateFrom && i.publishedAt! <= dateTo));
    if (dated.length > 0 && dated.every((i) => i.publishedAt! < dateFrom)) break;
  }
  return inRange;
}
