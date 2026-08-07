import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import {
  LISTING_PARSERS,
  PRESS_HOST_BASE_URLS,
  isLocalMediaRelease,
  parseArticlePage,
} from './dhs-press-parsers';
import type { PressHost, PressListingItem } from './dhs-press-parsers';

/**
 * DHS/ICE/CBP press-release fetcher (#605). Scrapes the three newsroom listing
 * views (approved scoped exception to the no-scraping constraint — see
 * PROJECT_KNOWLEDGE "Data sources"); article bodies come from a detail fetch
 * per release. Live listings only reach back to 2025-01-20 — historical
 * (baseline-period) recovery goes through lib/cron/backfill-dhs-press.ts.
 */

const FETCH_TIMEOUT_MS = 30_000;
export const DHS_PRESS_POLITENESS_MS = 2_000;
const MAX_PAGES = 50;

export const DHS_PRESS_SOURCE_ORIGIN = 'dhs_press';

interface HostConfig {
  listingPath: string;
  pageSize: number;
  agency: string;
}

export const PRESS_HOST_CONFIGS: Record<PressHost, HostConfig> = {
  dhs: {
    listingPath: '/news-releases/press-releases',
    pageSize: 10,
    agency: 'U.S. Department of Homeland Security',
  },
  ice: {
    listingPath: '/newsroom',
    pageSize: 25,
    agency: 'U.S. Immigration and Customs Enforcement',
  },
  cbp: {
    listingPath: '/newsroom/media-releases/all',
    pageSize: 10,
    agency: 'U.S. Customs and Border Protection',
  },
};

export interface DhsPressParams {
  host: PressHost;
  /** 'national' (CBP): drop local-media-release port-level roundups at fetch. */
  scope?: 'national';
  /** 'hsi-criminal': keep only HSI criminal-investigation releases (lawEnforcement fan-out signal). */
  filter?: 'hsi-criminal';
}

/**
 * Parse a dhs_press signal URL.
 * Formats: dhspress://dhs | dhspress://ice | dhspress://cbp?scope=national |
 *          dhspress://ice?filter=hsi-criminal
 */
export function parseDhsPressParams(signalUrl: string): DhsPressParams {
  const match = signalUrl.match(/^dhspress:\/\/([a-z]+)(\?.*)?$/);
  const host = match?.[1];
  if (host !== 'dhs' && host !== 'ice' && host !== 'cbp') {
    throw new Error(`[dhs-press] Unknown host in signal URL: ${signalUrl}`);
  }
  const query = new URLSearchParams(match?.[2]?.slice(1) ?? '');
  const params: DhsPressParams = { host };
  if (query.get('scope') === 'national') params.scope = 'national';
  if (query.get('filter') === 'hsi-criminal') params.filter = 'hsi-criminal';
  return params;
}

/**
 * HSI marker for the lawEnforcement fan-out (owner decision 2026-08-07): the
 * release must be attributed to Homeland Security Investigations. \bHSI\b is
 * case-sensitive deliberately (the dhs-oig acronym-pattern precedent).
 */
const HSI_PATTERN = /\bHSI\b|Homeland Security Investigations/;
/** Criminal-justice vocabulary distinguishing HSI criminal work from removal operations. */
const CRIMINAL_TERM_PATTERN =
  /\b(indict|charg(?:e[ds]?|ing)|convict|sentenc|plead(?:s|ed)? guilty|guilty plea|racketeer|money launder|child (?:exploitation|sexual|pornography)|human trafficking|drug trafficking|narcotics|smuggl|counterfeit|fraud|cybercrime|dark ?web|seiz(?:e[ds]?|ure))\w*/i;

/**
 * True when a press release is HSI criminal-investigation work (dual-stored to
 * lawEnforcement). Requires BOTH an HSI attribution and criminal-justice
 * vocabulary: HSI alone matches administrative/rhetoric releases, and criminal
 * terms alone match ERO removal roundups that belong to immigrationEnforcement.
 */
export function isHsiCriminalItem(
  item: Pick<PressListingItem, 'title' | 'topicTag' | 'teaser'>,
): boolean {
  const tagged = HSI_PATTERN.test(item.topicTag ?? '');
  const text = `${item.title} ${item.teaser ?? ''}`;
  return (tagged || HSI_PATTERN.test(text)) && CRIMINAL_TERM_PATTERN.test(text);
}

/** Normalized title used as the cross-host dedupe key component. */
export function normalizePressTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CROSS_HOST_PRECEDENCE: Record<PressHost, number> = { ice: 0, cbp: 1, dhs: 2 };

function dedupeByTitleAndDay<T>(
  items: T[],
  keyOf: (item: T) => { title: string; day: string; host: PressHost },
): T[] {
  const byKey = new Map<string, { item: T; host: PressHost }>();
  for (const item of items) {
    const { title, day, host } = keyOf(item);
    const key = `${normalizePressTitle(title)}|${day}`;
    const existing = byKey.get(key);
    if (!existing || CROSS_HOST_PRECEDENCE[host] < CROSS_HOST_PRECEDENCE[existing.host]) {
      byKey.set(key, { item, host });
    }
  }
  return [...byKey.values()].map((v) => v.item);
}

/**
 * Drop cross-host mirrors of the same release (DHS HQ re-posts component
 * releases). Key is normalized title + day; the component agency's original
 * (ICE > CBP > DHS) wins. Residue (cross-week reposts, ±1-day skew) is
 * measured by the post-backfill dedup audit rather than widened here.
 */
export function dedupeCrossHost(items: PressListingItem[]): PressListingItem[] {
  return dedupeByTitleAndDay(items, (i) => ({
    title: i.title,
    day: i.publishedAt ?? '',
    host: i.host,
  }));
}

/** ContentItem-level twin of dedupeCrossHost, for merges after toContentItem. */
export function dedupeCrossHostContentItems(items: ContentItem[]): ContentItem[] {
  return dedupeByTitleAndDay(items, (i) => ({
    title: i.title ?? '',
    day: i.pubDate ?? '',
    host: ((i.metadata?.host as PressHost | undefined) ?? 'dhs') as PressHost,
  }));
}

/** Body text below this length marks the stored document metadata_only (#645 pattern). */
export const PRESS_MIN_BODY_CHARS = 100;

/** Convert a listing item (+ optional article enrichment) to a ContentItem. */
export function toContentItem(item: PressListingItem): ContentItem {
  const body = item.body ?? '';
  return {
    title: item.title,
    link: item.url,
    pubDate: item.publishedAt ?? undefined,
    agency: PRESS_HOST_CONFIGS[item.host].agency,
    content: body || item.teaser || item.title,
    type: 'press_release',
    // Explicit: document-store inferSourceOrigin maps press_release → 'doj'.
    sourceOrigin: DHS_PRESS_SOURCE_ORIGIN,
    contentType: body.length < PRESS_MIN_BODY_CHARS ? 'metadata_only' : undefined,
    metadata: {
      host: item.host,
      topicTag: item.topicTag ?? null,
      urlClass: item.urlClass ?? null,
      locality: item.locality ?? null,
    },
  };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`[dhs-press] HTTP ${response.status} for ${url}`);
  return response.text();
}

function listingPageUrl(host: PressHost, page: number): string {
  const base = `${PRESS_HOST_BASE_URLS[host]}${PRESS_HOST_CONFIGS[host].listingPath}`;
  return page > 0 ? `${base}?page=${page}` : base;
}

function applySignalFilters(items: PressListingItem[], params: DhsPressParams): PressListingItem[] {
  let kept = items;
  if (params.scope === 'national') kept = kept.filter((i) => !isLocalMediaRelease(i.url));
  if (params.filter === 'hsi-criminal') kept = kept.filter((i) => isHsiCriminalItem(i));
  return kept;
}

/** Fetch a release's article page in place; a failed fetch leaves listing fields intact. */
export async function enrichFromArticlePage(item: PressListingItem): Promise<void> {
  try {
    const article = parseArticlePage(await fetchHtml(item.url), item.host, item.url);
    item.body = article.body;
    item.locality = article.locality;
    // The article date is authoritative; listings occasionally show update dates.
    if (article.publishedAt) item.publishedAt = article.publishedAt;
    // Sitemap-recovered items (backfill driver) start with no listing title.
    if (!item.title && article.title) item.title = article.title;
  } catch (err) {
    console.warn(`[dhs-press] Article fetch failed for ${item.url}: ${err}`);
  }
}

/**
 * Fetch press releases for [dateFrom, dateTo] for one signal. Walks the host's
 * listing newest-first (no server-side date filter exists), stopping once an
 * entire page predates dateFrom — weekly incremental runs cost 1–3 listing
 * pages. Each in-range release's article page is then fetched for the body and
 * authoritative date.
 */
/**
 * Walk a host's live listing newest-first collecting items in [dateFrom,
 * dateTo]; stops once an entire page predates dateFrom. Weekly incremental
 * runs cost 1–3 listing pages. Live listings reach back only to 2025-01-20 —
 * earlier ranges return empty (baseline recovery is backfill-dhs-press).
 */
export async function walkListingRange(
  host: PressHost,
  dateFrom: string,
  dateTo: string,
  maxPages: number = MAX_PAGES,
): Promise<PressListingItem[]> {
  const inRange: PressListingItem[] = [];
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(DHS_PRESS_POLITENESS_MS);
    const items = LISTING_PARSERS[host](await fetchHtml(listingPageUrl(host, page)));
    if (items.length === 0) break;

    const dated = items.filter((i) => i.publishedAt !== null);
    inRange.push(...dated.filter((i) => i.publishedAt! >= dateFrom && i.publishedAt! <= dateTo));
    if (dated.length > 0 && dated.every((i) => i.publishedAt! < dateFrom)) break;
  }
  return inRange;
}

export async function fetchDhsPressHistorical(params: {
  host: PressHost;
  scope?: 'national';
  filter?: 'hsi-criminal';
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
  skipDetailUrls?: Set<string>;
  skipDetail?: boolean;
}): Promise<ContentItem[]> {
  const { host, dateFrom, dateTo, maxPages = MAX_PAGES, skipDetailUrls, skipDetail } = params;

  const inRange = await walkListingRange(host, dateFrom, dateTo, maxPages);
  const kept = applySignalFilters(inRange, params);
  for (const item of kept) {
    if (skipDetail || skipDetailUrls?.has(item.url)) continue;
    await sleep(DHS_PRESS_POLITENESS_MS);
    await enrichFromArticlePage(item);
  }

  // Post-enrichment date guard: the authoritative article date can move an item
  // out of range (listing showed an update date).
  const final = kept.filter(
    (i) => i.publishedAt !== null && i.publishedAt >= dateFrom && i.publishedAt <= dateTo,
  );
  console.log(`  [dhs-press] ${final.length} releases for ${host} ${dateFrom}..${dateTo}`);
  return final.map(toContentItem);
}
