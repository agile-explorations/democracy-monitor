/**
 * Incremental document fetcher for the snapshot pipeline.
 * API signals (FR, CL, DOJ, GovInfo, FEC, OIG) use historical fetchers with
 * per-source dateFrom to avoid gaps between sources with different frequencies.
 * RSS/HTML/JSON signals use existing latest-N behavior (no historical API).
 */

import {
  fetchWeekItemsFr,
  fetchWeekItemsCourtListener,
  fetchWeekItemsDoj,
  fetchWeekItemsGovInfo,
  fetchWeekItemsFec,
  fetchWeekItemsOig,
} from '@/lib/cron/backfill-fetchers';
import type { SourceFetchResult } from '@/lib/cron/backfill-fetchers';
import type { FeedItem } from '@/lib/parsers/feed-parser';
import { fetchSignalWithMetadata } from '@/lib/services/feed-fetcher';
import type { SignalFetchResult } from '@/lib/services/feed-fetcher';
import type { Category, Signal } from '@/lib/types';
import type { ContentItem } from '@/lib/types/assessment';
import { toDateString } from '@/lib/utils/date-utils';

const API_SIGNAL_TYPES = new Set([
  'federal_register',
  'courtlistener',
  'doj_json',
  'govinfo',
  'fec_json',
  'oig_html',
]);

export interface IncrementalFetchResult {
  items: ContentItem[];
  signalResults: SignalFetchResult[];
}

type GroupedSignals = {
  fr: Signal[];
  cl: Signal[];
  doj: Signal[];
  gi: Signal[];
  fec: Signal[];
  oig: Signal[];
  rss: Signal[];
};

/** Maps fetcher group keys to document source_origin values in the DB. */
const GROUP_TO_SOURCE_ORIGIN: Record<string, string> = {
  fr: 'federal_register',
  cl: 'courtlistener',
  doj: 'doj',
  gi: 'govinfo',
  fec: 'fec',
  oig: 'oig',
};

function groupSignals(signals: Signal[]): GroupedSignals {
  return {
    fr: signals.filter((s) => s.type === 'federal_register'),
    cl: signals.filter((s) => s.type === 'courtlistener'),
    doj: signals.filter((s) => s.type === 'doj_json'),
    gi: signals.filter((s) => s.type === 'govinfo'),
    fec: signals.filter((s) => s.type === 'fec_json'),
    oig: signals.filter((s) => s.type === 'oig_html'),
    rss: signals.filter((s) => !API_SIGNAL_TYPES.has(s.type)),
  };
}

function sourceResultToSignalResult(
  signal: Signal,
  result: SourceFetchResult,
  startMs: number,
): SignalFetchResult {
  return {
    signalId: signal.id ?? signal.url,
    signalName: signal.name,
    signalType: signal.type,
    success: result.errors.length === 0,
    documentCount: result.items.length,
    durationMs: Date.now() - startMs,
    errorMessage: result.errors[0],
    items: result.items.map((i): FeedItem => ({ ...i, title: i.title ?? '' })),
  };
}

/** Fetch API signals incrementally, using per-source last-document dates. */
async function fetchApiSignals(
  groups: GroupedSignals,
  categoryKey: string,
  sourceDates: Record<string, string>,
  fallbackSince: string,
): Promise<{ items: ContentItem[]; signalResults: SignalFetchResult[] }> {
  const today = toDateString(new Date());
  const items: ContentItem[] = [];
  const signalResults: SignalFetchResult[] = [];

  const fetchers: Array<{
    key: keyof GroupedSignals;
    fn: typeof fetchWeekItemsFr;
  }> = [
    { key: 'fr', fn: fetchWeekItemsFr },
    { key: 'cl', fn: fetchWeekItemsCourtListener },
    { key: 'doj', fn: fetchWeekItemsDoj },
    { key: 'gi', fn: fetchWeekItemsGovInfo },
    { key: 'fec', fn: fetchWeekItemsFec },
    { key: 'oig', fn: fetchWeekItemsOig },
  ];

  for (const { key, fn } of fetchers) {
    const signals = groups[key];
    if (signals.length === 0) continue;
    const sourceOrigin = GROUP_TO_SOURCE_ORIGIN[key];
    const since = sourceDates[sourceOrigin] ?? fallbackSince;
    const week = { start: since, end: today };
    const start = Date.now();
    const result = await fn(signals, week, categoryKey);
    items.push(...result.items);
    signalResults.push(sourceResultToSignalResult(signals[0], result, start));
  }

  return { items, signalResults };
}

/** Fetch non-API signals (RSS/HTML/JSON) using existing latest-N behavior. */
async function fetchRssSignals(
  signals: Signal[],
): Promise<{ items: ContentItem[]; signalResults: SignalFetchResult[] }> {
  const items: ContentItem[] = [];
  const signalResults: SignalFetchResult[] = [];

  const settled = await Promise.allSettled(signals.map((s) => fetchSignalWithMetadata(s)));

  for (const r of settled) {
    if (r.status === 'fulfilled') {
      signalResults.push(r.value);
      items.push(...r.value.items);
    }
  }

  return { items, signalResults };
}

/**
 * Fetch category documents incrementally.
 * API signals fetch from per-source last-document dates to today.
 * RSS/HTML/JSON signals fetch latest-N.
 *
 * @param sourceDates - Map of source_origin → last document date (from getLastDocumentDateBySource)
 * @param fallbackSince - Used when a source has no stored documents yet
 */
export async function fetchCategoryIncremental(
  cat: Category,
  sourceDates: Record<string, string>,
  fallbackSince: string,
): Promise<IncrementalFetchResult> {
  const groups = groupSignals(cat.signals);
  const allItems: ContentItem[] = [];
  const allResults: SignalFetchResult[] = [];

  const api = await fetchApiSignals(groups, cat.key, sourceDates, fallbackSince);
  allItems.push(...api.items);
  allResults.push(...api.signalResults);

  const rss = await fetchRssSignals(groups.rss);
  allItems.push(...rss.items);
  allResults.push(...rss.signalResults);

  return { items: allItems, signalResults: allResults };
}
