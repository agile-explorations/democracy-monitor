import {
  fetchCourtListenerHistorical,
  parseCourtListenerParams,
  extractDocketId,
  fetchOpinionText,
  buildOpinionContentItem,
} from '@/lib/services/courtlistener-fetcher';
import { fetchDojHistorical, parseDojSignalParams } from '@/lib/services/doj-fetcher';
import { fetchDojOigHistorical } from '@/lib/services/doj-oig-fetcher';
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
import { fetchHhsOigHistorical } from '@/lib/services/hhs-oig-fetcher';
import { fetchSsaOigHistorical } from '@/lib/services/ssa-oig-fetcher';
import type { ContentItem } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';
import { sleep } from '@/lib/utils/async';
import { deduplicateByUrl } from '@/lib/utils/collections';

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

export interface SourceFetchResult {
  items: ContentItem[];
  errors: string[];
}

export interface WeekFetchResult {
  items: ContentItem[];
  sourceResults: Record<string, { itemCount: number; errors: string[] }>;
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

  return { items, errors };
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

  return { items, errors };
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

  return { items, errors };
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

  return { items, errors };
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

  for (const { key, fn } of GROUP_FETCHERS) {
    if (signalGroups[key].length === 0) continue;
    const result = await fn(signalGroups[key], week, categoryKey);
    allItems.push(...result.items);
    sourceResults[SOURCE_ORIGIN_MAP[key]] = {
      itemCount: result.items.length,
      errors: result.errors,
    };
  }

  return { items: deduplicateByUrl(allItems), sourceResults };
}
