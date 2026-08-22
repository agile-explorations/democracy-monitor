import { fetchText } from '@/lib/services/wayback-cdx';
import { sleep } from '@/lib/utils/async';
import { cbpUrlClass, isLocalMediaRelease, parseDhsListingPage } from './dhs-press-parsers';
import type { PressListingItem } from './dhs-press-parsers';

// CDX client extracted to wayback-cdx.ts (#739); re-exported so existing
// call sites and tests are unchanged.
export {
  fetchCdxFirstCaptures,
  normalizeCdxUrl,
  parseCdxResponse,
} from '@/lib/services/wayback-cdx';
export type { CdxCapture } from '@/lib/services/wayback-cdx';

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

const SITEMAP_DELAY_MS = 2_000;
const MAX_SITEMAP_PAGES = 40;
const MAX_ARCHIVE_PAGES = 500;

/** Capture-date safety buffer: releases are normally crawled within days of publication. */
export const CDX_BUFFER_DAYS = 60;

export const DHS_ARCHIVE_PRESS_PATH = '/archive/news?field_news_type_target_id=436';

/** Extract <loc> URLs from a sitemap page (pure). */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

/** ICE press-release URLs from a sitemap URL list (pure). */
export function filterIcePressUrls(urls: string[]): string[] {
  return urls.filter((u) => /^https:\/\/www\.ice\.gov\/news\/releases\/[^/?#]+$/.test(u));
}

/**
 * CBP press-release URLs (national scope drops local-media-release) (pure).
 * Only media-release classes are kept — speeches-and-statements is excluded so
 * the baseline (sitemap) scope matches the live listing walk, which reads the
 * /newsroom/media-releases view (era-scope parity, owner decision 2026-08-07).
 */
export function filterCbpPressUrls(urls: string[], scope?: 'national'): string[] {
  return urls.filter((u) => {
    if (!u.startsWith('https://www.cbp.gov/')) return false;
    const urlClass = cbpUrlClass(u);
    if (urlClass === null || !urlClass.endsWith('media-release')) return false;
    return scope === 'national' ? !isLocalMediaRelease(u) : true;
  });
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
