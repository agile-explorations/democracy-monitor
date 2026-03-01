/**
 * Incremental document fetcher for the snapshot pipeline.
 * API signals (FR, CL, DOJ, GovInfo, FEC) use historical fetchers with dateFrom=since.
 * RSS/HTML/JSON signals use existing latest-N behavior (no historical API).
 */

import {
  fetchWeekItemsFr,
  fetchWeekItemsCourtListener,
  fetchWeekItemsDoj,
  fetchWeekItemsGovInfo,
  fetchWeekItemsFec,
} from '@/lib/cron/backfill-fetchers';
import type { SourceFetchResult } from '@/lib/cron/backfill-fetchers';
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
  rss: Signal[];
};

function groupSignals(signals: Signal[]): GroupedSignals {
  return {
    fr: signals.filter((s) => s.type === 'federal_register'),
    cl: signals.filter((s) => s.type === 'courtlistener'),
    doj: signals.filter((s) => s.type === 'doj_json'),
    gi: signals.filter((s) => s.type === 'govinfo'),
    fec: signals.filter((s) => s.type === 'fec_json'),
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
    items: result.items,
  };
}

/** Fetch API signals incrementally from `since` to today. */
async function fetchApiSignals(
  groups: GroupedSignals,
  categoryKey: string,
  since: string,
): Promise<{ items: ContentItem[]; signalResults: SignalFetchResult[] }> {
  const today = toDateString(new Date());
  const week = { start: since, end: today };
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
  ];

  for (const { key, fn } of fetchers) {
    const signals = groups[key];
    if (signals.length === 0) continue;
    const start = Date.now();
    const result = await fn(signals, week, categoryKey);
    items.push(...result.items);
    // Create a single signal result per group for health tracking
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
 * API signals fetch from `since` to today. RSS/HTML/JSON fetch latest-N.
 */
export async function fetchCategoryIncremental(
  cat: Category,
  since: string,
): Promise<IncrementalFetchResult> {
  const groups = groupSignals(cat.signals);
  const allItems: ContentItem[] = [];
  const allResults: SignalFetchResult[] = [];

  const api = await fetchApiSignals(groups, cat.key, since);
  allItems.push(...api.items);
  allResults.push(...api.signalResults);

  const rss = await fetchRssSignals(groups.rss);
  allItems.push(...rss.items);
  allResults.push(...rss.signalResults);

  return { items: allItems, signalResults: allResults };
}
