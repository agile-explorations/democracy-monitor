import {
  fetchCourtListenerHistorical,
  parseCourtListenerParams,
  extractDocketId,
  fetchOpinionText,
  buildOpinionContentItem,
} from '@/lib/services/courtlistener-fetcher';
import { fetchDojHistorical, parseDojSignalParams } from '@/lib/services/doj-fetcher';
import { fetchDojOigHistorical, fetchDojOigPdfUrl } from '@/lib/services/doj-oig-fetcher';
import { fetchFecEnrichedContent } from '@/lib/services/fec-content';
import { fetchFecHistorical, parseFecParams } from '@/lib/services/fec-fetcher';
import {
  fetchFederalRegisterHistorical,
  fetchFrRawText,
  parseSignalParams,
} from '@/lib/services/federal-register-fetcher';
import {
  fetchGovInfoHistorical,
  fetchGovInfoText,
  parseGovInfoParams,
} from '@/lib/services/govinfo-fetcher';
import { fetchHhsOigHistorical, fetchHhsOigReportContent } from '@/lib/services/hhs-oig-fetcher';
import { fetchSsaOigHistorical } from '@/lib/services/ssa-oig-fetcher';
import type { ContentItem } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';
import { sleep } from '@/lib/utils/async';
import { deduplicateByUrl } from '@/lib/utils/collections';
import { extractPdfText } from '@/lib/utils/pdf-extractor';

type Signal = { url: string; type: string };
type SignalGroups = {
  fr: Signal[];
  cl: Signal[];
  doj: Signal[];
  gi: Signal[];
  fec: Signal[];
  oig: Signal[];
};

interface WeekRange {
  start: string;
  end: string;
}

export interface ContentGaps {
  source: string;
  nullCount: number;
  shortCount: number;
}

export interface SourceFetchResult {
  items: ContentItem[];
  errors: string[];
  contentGaps?: ContentGaps;
}

export interface WeekFetchResult {
  items: ContentItem[];
  sourceResults: Record<string, { itemCount: number; errors: string[] }>;
  contentGaps: ContentGaps[];
}

const SOURCE_ORIGIN_MAP: Record<keyof SignalGroups, string> = {
  fr: 'federal_register',
  cl: 'courtlistener',
  doj: 'doj',
  gi: 'govinfo',
  fec: 'fec',
  oig: 'oig',
};

const SIGNAL_MAX_RETRIES = 3;
const SIGNAL_RETRY_BACKOFF_MS = 10_000;

/** Retry a single signal fetch up to SIGNAL_MAX_RETRIES times with progressive backoff. */
async function fetchSignalWithRetry(
  fetchFn: () => Promise<ContentItem[]>,
  label: string,
  categoryKey: string,
  weekStart: string,
): Promise<{ items: ContentItem[]; error: string | null }> {
  for (let attempt = 1; attempt <= SIGNAL_MAX_RETRIES; attempt++) {
    try {
      return { items: await fetchFn(), error: null };
    } catch (err) {
      if (attempt < SIGNAL_MAX_RETRIES) {
        const delay = SIGNAL_RETRY_BACKOFF_MS * 2 ** (attempt - 1);
        console.log(
          `  [${categoryKey}] ${label} attempt ${attempt}/${SIGNAL_MAX_RETRIES} failed for ${weekStart}, retrying in ${delay / 1000}s...`,
        );
        await sleep(delay);
      } else {
        const msg = `${label} fetch error for ${weekStart}: ${formatError(err)} (after ${SIGNAL_MAX_RETRIES} attempts)`;
        console.error(`  [${categoryKey}] ${msg}`);
        return { items: [], error: msg };
      }
    }
  }
  return { items: [], error: null };
}

/** Fill content for FR items that have a raw_text_url but no summary. */
async function fillFrContent(items: ContentItem[]): Promise<void> {
  for (const item of items) {
    if (item.summary) continue;
    const rawTextUrl = item.metadata?.raw_text_url as string | undefined;
    if (!rawTextUrl) continue;
    const text = await fetchFrRawText(rawTextUrl);
    if (text) item.summary = text;
  }
}

/** Fetch opinions for CL docket items and append as new ContentItems. */
async function fillClOpinions(items: ContentItem[]): Promise<void> {
  // Snapshot the current length to avoid iterating over newly-added opinion items
  const docketCount = items.length;
  for (let i = 0; i < docketCount; i++) {
    const item = items[i];
    if (item.type !== 'court_opinion' || !item.link) continue;
    const docketId = extractDocketId(item.link);
    if (!docketId) continue;

    const opinion = await fetchOpinionText(docketId);
    if (!opinion) continue;

    // Sanity check: skip opinions that predate the docket filing (CL data mislinkage)
    if (item.pubDate && opinion.dateFiled < item.pubDate) continue;

    const meta = item.metadata as Record<string, unknown> | undefined;
    items.push(
      buildOpinionContentItem(opinion, {
        caseName: item.title ?? '(untitled case)',
        court: item.agency ?? 'Federal Court',
        docketId,
        suitNature: (meta?.suitNature as string) ?? undefined,
      }),
    );
  }
}

/** Fill content for GovInfo items that have a packageId but no summary. */
async function fillGovInfoContent(items: ContentItem[]): Promise<void> {
  for (const item of items) {
    if (item.summary) continue;
    const packageId = item.metadata?.packageId as string | undefined;
    if (!packageId) continue;
    const text = await fetchGovInfoText(packageId);
    if (text) item.summary = text;
  }
}

const FEC_RATE_LIMIT_MS = 4_000;
const HHS_OIG_CRAWL_DELAY_MS = 10_000;
const DOJ_OIG_CRAWL_DELAY_MS = 5_000;
const SSA_OIG_RATE_LIMIT_MS = 2_000;

/** Enrich FEC items with full structured data + PDF text extraction. */
async function fillFecContent(items: ContentItem[]): Promise<void> {
  for (const item of items) {
    if (!item.link) continue;
    const enriched = await fetchFecEnrichedContent(item.link);
    if (enriched && enriched.length > (item.summary?.length ?? 0)) {
      item.summary = enriched;
    }
    await sleep(FEC_RATE_LIMIT_MS);
  }
}

/** Fill content for OIG items by scraping detail pages or extracting PDFs. */
async function fillOigContent(items: ContentItem[]): Promise<void> {
  for (const item of items) {
    if (!item.link) continue;
    const result = await fetchOigItemContent(item.link);
    if (result.content && result.content.length > (item.summary?.length ?? 0)) {
      item.summary = result.content;
    }
    await sleep(result.delayMs);
  }
}

async function fetchOigItemContent(
  url: string,
): Promise<{ content: string | null; delayMs: number }> {
  if (url.includes('oig.hhs.gov')) {
    const content = await fetchHhsOigReportContent(url);
    return { content, delayMs: HHS_OIG_CRAWL_DELAY_MS };
  }
  if (url.endsWith('.pdf')) {
    const content = await extractPdfText(url);
    return { content, delayMs: SSA_OIG_RATE_LIMIT_MS };
  }
  if (url.includes('oig.justice.gov')) {
    const pdfUrl = await fetchDojOigPdfUrl(url);
    if (!pdfUrl) return { content: null, delayMs: DOJ_OIG_CRAWL_DELAY_MS };
    await sleep(DOJ_OIG_CRAWL_DELAY_MS);
    const content = await extractPdfText(pdfUrl);
    return { content, delayMs: DOJ_OIG_CRAWL_DELAY_MS };
  }
  return { content: null, delayMs: 0 };
}

export async function fetchWeekItemsFr(
  frSignals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<SourceFetchResult> {
  const items: ContentItem[] = [];
  const errors: string[] = [];

  for (const signal of frSignals) {
    const params = parseSignalParams(signal.url);
    const result = await fetchSignalWithRetry(
      () =>
        fetchFederalRegisterHistorical({
          ...params,
          dateFrom: week.start,
          dateTo: week.end,
          perPage: 1000,
          delayMs: 200,
        }),
      'FR',
      categoryKey,
      week.start,
    );
    items.push(...result.items);
    if (result.error) errors.push(result.error);
  }

  await fillFrContent(items);

  const nullCount = items.filter(
    (i) => !i.summary && (i.metadata as Record<string, unknown>)?.raw_text_url,
  ).length;
  const contentGaps: ContentGaps | undefined =
    nullCount > 0 ? { source: 'FR', nullCount, shortCount: 0 } : undefined;

  return { items, errors, contentGaps };
}

export async function fetchWeekItemsCourtListener(
  signals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<SourceFetchResult> {
  const items: ContentItem[] = [];
  const errors: string[] = [];

  for (const signal of signals) {
    const params = parseCourtListenerParams(signal.url);
    const result = await fetchSignalWithRetry(
      () => fetchCourtListenerHistorical({ ...params, dateFrom: week.start, dateTo: week.end }),
      'CourtListener',
      categoryKey,
      week.start,
    );
    items.push(...result.items);
    if (result.error) errors.push(result.error);
  }

  await fillClOpinions(items);

  return { items, errors };
}

export async function fetchWeekItemsDoj(
  signals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<SourceFetchResult> {
  const items: ContentItem[] = [];
  const errors: string[] = [];

  for (const signal of signals) {
    const params = parseDojSignalParams(signal.url);
    const result = await fetchSignalWithRetry(
      () => fetchDojHistorical({ ...params, dateFrom: week.start, dateTo: week.end }),
      'DOJ',
      categoryKey,
      week.start,
    );
    items.push(...result.items);
    if (result.error) errors.push(result.error);
  }

  return { items, errors };
}

export async function fetchWeekItemsGovInfo(
  signals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<SourceFetchResult> {
  const items: ContentItem[] = [];
  const errors: string[] = [];

  for (const signal of signals) {
    const params = parseGovInfoParams(signal.url);
    const result = await fetchSignalWithRetry(
      () => fetchGovInfoHistorical({ ...params, dateFrom: week.start, dateTo: week.end }),
      'GovInfo',
      categoryKey,
      week.start,
    );
    items.push(...result.items);
    if (result.error) errors.push(result.error);
  }

  await fillGovInfoContent(items);

  const nullCount = items.filter(
    (i) => !i.summary && (i.metadata as Record<string, unknown>)?.packageId,
  ).length;
  const contentGaps: ContentGaps | undefined =
    nullCount > 0 ? { source: 'GovInfo', nullCount, shortCount: 0 } : undefined;

  return { items, errors, contentGaps };
}

export async function fetchWeekItemsFec(
  signals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<SourceFetchResult> {
  const items: ContentItem[] = [];
  const errors: string[] = [];

  for (const signal of signals) {
    const params = parseFecParams(signal.url);
    const result = await fetchSignalWithRetry(
      () => fetchFecHistorical({ ...params, dateFrom: week.start, dateTo: week.end }),
      'FEC',
      categoryKey,
      week.start,
    );
    items.push(...result.items);
    if (result.error) errors.push(result.error);
  }

  await fillFecContent(items);

  const shortCount = items.filter((i) => i.summary && i.summary.length < 400).length;
  const contentGaps: ContentGaps | undefined =
    shortCount > 0 ? { source: 'FEC', nullCount: 0, shortCount } : undefined;

  return { items, errors, contentGaps };
}

const OIG_FETCHERS: Record<
  string,
  (params: { dateFrom: string; dateTo: string }) => Promise<ContentItem[]>
> = {
  'oig://doj': (p) => fetchDojOigHistorical(p),
  'oig://hhs': (p) => fetchHhsOigHistorical(p),
  'oig://ssa': (p) => fetchSsaOigHistorical(p),
};

export async function fetchWeekItemsOig(
  signals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<SourceFetchResult> {
  const items: ContentItem[] = [];
  const errors: string[] = [];

  for (const signal of signals) {
    const fetcher = OIG_FETCHERS[signal.url];
    if (!fetcher) {
      errors.push(`Unknown OIG signal URL: ${signal.url}`);
      continue;
    }
    const result = await fetchSignalWithRetry(
      () => fetcher({ dateFrom: week.start, dateTo: week.end }),
      'OIG',
      categoryKey,
      week.start,
    );
    items.push(...result.items);
    if (result.error) errors.push(result.error);
  }

  await fillOigContent(items);

  const shortCount = items.filter(
    (i) => i.summary && /^(Audit|Report|Investigative)/.test(i.summary) && i.summary.length < 100,
  ).length;
  const nullCount = items.filter((i) => !i.summary).length;
  const contentGaps: ContentGaps | undefined =
    nullCount > 0 || shortCount > 0 ? { source: 'OIG', nullCount, shortCount } : undefined;

  return { items, errors, contentGaps };
}

type FetchFn = (
  signals: Signal[],
  week: WeekRange,
  categoryKey: string,
) => Promise<SourceFetchResult>;

const GROUP_FETCHERS: Array<{ key: keyof SignalGroups; fn: FetchFn }> = [
  { key: 'fr', fn: fetchWeekItemsFr },
  { key: 'cl', fn: fetchWeekItemsCourtListener },
  { key: 'doj', fn: fetchWeekItemsDoj },
  { key: 'gi', fn: fetchWeekItemsGovInfo },
  { key: 'fec', fn: fetchWeekItemsFec },
  { key: 'oig', fn: fetchWeekItemsOig },
];

export async function fetchWeekDocuments(
  week: WeekRange,
  signalGroups: SignalGroups,
  categoryKey: string,
): Promise<WeekFetchResult> {
  const allItems: ContentItem[] = [];
  const sourceResults: Record<string, { itemCount: number; errors: string[] }> = {};
  const contentGaps: ContentGaps[] = [];

  for (const { key, fn } of GROUP_FETCHERS) {
    if (signalGroups[key].length === 0) continue;
    const result = await fn(signalGroups[key], week, categoryKey);
    allItems.push(...result.items);
    sourceResults[SOURCE_ORIGIN_MAP[key]] = {
      itemCount: result.items.length,
      errors: result.errors,
    };
    if (result.contentGaps) contentGaps.push(result.contentGaps);
  }

  return { items: deduplicateByUrl(allItems), sourceResults, contentGaps };
}
