/**
 * GAO product fetcher via Wayback (#739). gao.gov WAF-blocks non-browser
 * fetches at the TLS/fingerprint level (403 on robots.txt itself) and the
 * GovInfo GAOREPORTS collection is a dead pre-2009 archive (#529), so GAO
 * products are read from Internet Archive captures: CDX enumerates product
 * pages, raw replay (`id_`) serves each page's original bytes, and
 * gao-parsers.ts extracts the Highlights prose.
 *
 * Two entry points per the house fetcher pattern:
 * - fetchGaoHistorical: full CDX enumeration, RELEASE-date scoped (backfill).
 * - fetchGaoRecent: CDX capture-window scoped (weekly snapshot) — keyed on
 *   capture time so an IA-late capture of an older report still arrives,
 *   dated by its true release date (CHRG-style late arrival, disclosed).
 *
 * I/O module — coverage-excluded; parsing is pure and tested in
 * gao-parsers.test.ts.
 */

import {
  canonicalGaoProduct,
  parseGaoProductPage,
  toContentItem,
} from '@/lib/services/gao-parsers';
import type { GaoProductRef } from '@/lib/services/gao-parsers';
import { fetchCdxFirstCaptures, WAYBACK_USER_AGENT } from '@/lib/services/wayback-cdx';
import type { CdxWindow } from '@/lib/services/wayback-cdx';
import type { ContentItem } from '@/lib/types/assessment';
import { sleep } from '@/lib/utils/async';

const REPLAY_DELAY_MS = 2_000;
const REPLAY_TIMEOUT_MS = 45_000;

/** GAO ids are fiscal-year coded (gao-25-* begins Oct 2024): a calendar
 *  range [from, to] can contain ids coded from's year through to's year + 1. */
export function gaoIdPrefixesForRange(dateFrom: string, dateTo: string): string[] {
  const fromYear = Number(dateFrom.slice(2, 4));
  const toYear = Number(dateTo.slice(2, 4)) + 1;
  const prefixes: string[] = [];
  for (let year = fromYear; year <= toYear; year++) {
    prefixes.push(`gao.gov/products/gao-${String(year).padStart(2, '0')}-`);
  }
  return prefixes;
}

/** Raw replay of one capture (original bytes; fetch auto-decodes gzip). */
async function fetchReplay(captureUrl: string): Promise<string | null> {
  try {
    const response = await fetch(captureUrl, {
      headers: { 'User-Agent': WAYBACK_USER_AGENT },
      signal: AbortSignal.timeout(REPLAY_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!response.ok) {
      console.warn(`[gao] replay HTTP ${response.status} for ${captureUrl}`);
      return null;
    }
    return await response.text();
  } catch (err) {
    console.warn(`[gao] replay failed for ${captureUrl}: ${err}`);
    return null;
  }
}

export interface GaoEnumerated extends GaoProductRef {
  firstCaptureTs: string;
}

/** CDX-enumerate distinct GAO products for a set of id prefixes. */
export async function enumerateGaoProducts(
  prefixes: string[],
  window?: CdxWindow,
): Promise<GaoEnumerated[]> {
  const byId = new Map<string, GaoEnumerated>();
  for (const prefix of prefixes) {
    const captures = await fetchCdxFirstCaptures(prefix, window);
    for (const [url, timestamp] of captures) {
      const ref = canonicalGaoProduct(url);
      if (!ref) continue;
      const existing = byId.get(ref.productId);
      if (!existing || timestamp < existing.firstCaptureTs) {
        byId.set(ref.productId, { ...ref, firstCaptureTs: timestamp });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.productId.localeCompare(b.productId));
}

/** Replay-fetch and parse one enumerated product. Null when the capture is
 *  unreadable (failure-tolerant — reported by the caller's counts). */
async function fetchProduct(product: GaoEnumerated): Promise<ContentItem | null> {
  const captureUrl = `https://web.archive.org/web/${product.firstCaptureTs}id_/${product.canonicalUrl}`;
  const html = await fetchReplay(captureUrl);
  if (!html) return null;
  const parsed = parseGaoProductPage(html);
  if (!parsed.title) {
    console.warn(`[gao] unparseable capture for ${product.productId}`);
    return null;
  }
  return toContentItem({
    ref: product,
    parsed,
    captureUrl,
    firstCaptureTs: product.firstCaptureTs,
  });
}

export async function fetchProducts(
  products: GaoEnumerated[],
  opts?: { limit?: number; skipUrls?: Set<string> },
): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  for (const product of products) {
    if (opts?.limit && items.length >= opts.limit) break;
    if (opts?.skipUrls?.has(product.canonicalUrl)) continue;
    const item = await fetchProduct(product);
    await sleep(REPLAY_DELAY_MS);
    if (item) items.push(item);
  }
  return items;
}

/**
 * Backfill fetch: enumerate every product for the range's fiscal-year
 * prefixes, fetch, and keep items whose release date falls in range.
 */
export async function fetchGaoHistorical(params: {
  dateFrom: string;
  dateTo: string;
  limit?: number;
  skipUrls?: Set<string>;
}): Promise<ContentItem[]> {
  const products = await enumerateGaoProducts(
    gaoIdPrefixesForRange(params.dateFrom, params.dateTo),
  );
  const items = await fetchProducts(products, params);
  const inRange = items.filter(
    (i) => i.pubDate && i.pubDate >= params.dateFrom && i.pubDate <= params.dateTo,
  );
  console.log(
    `  [gao] ${inRange.length}/${items.length} products in range ${params.dateFrom}..${params.dateTo} (${products.length} enumerated)`,
  );
  return inRange;
}

/**
 * Weekly fetch: capture-window enumeration (captures NEW in the window),
 * no release-date lower bound — late captures keep their true dates and
 * upsert idempotently by url+category.
 */
export async function fetchGaoRecent(params: {
  dateFrom: string;
  dateTo: string;
}): Promise<ContentItem[]> {
  const window: CdxWindow = {
    from: params.dateFrom.replace(/-/g, ''),
    to: params.dateTo.replace(/-/g, ''),
  };
  // Prefix range widened one fiscal year back: a late capture of last
  // year's product id must still enumerate.
  const prefixFloor = `${Number(params.dateFrom.slice(0, 4)) - 1}${params.dateFrom.slice(4)}`;
  const products = await enumerateGaoProducts(
    gaoIdPrefixesForRange(prefixFloor, params.dateTo),
    window,
  );
  const items = await fetchProducts(products);
  const bounded = items.filter((i) => i.pubDate && i.pubDate <= params.dateTo);
  console.log(
    `  [gao] ${bounded.length} products from captures ${params.dateFrom}..${params.dateTo}`,
  );
  return bounded;
}
