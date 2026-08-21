/**
 * Incremental document fetcher for the snapshot pipeline.
 * All signals use API-based historical fetchers with per-source dateFrom
 * to avoid gaps between sources with different publication frequencies.
 */

import {
  fetchWeekItemsFr,
  fetchWeekItemsCourtListener,
  fetchWeekItemsDoj,
  fetchWeekItemsGovInfo,
  fetchWeekItemsFec,
  fetchWeekItemsOig,
  fetchWeekItemsDhsPress,
  fetchWeekItemsGao,
} from '@/lib/cron/backfill-fetchers';
import type { SourceFetchResult } from '@/lib/cron/backfill-fetchers';
import type { FeedItem } from '@/lib/parsers/feed-parser';
import type { SignalFetchResult } from '@/lib/services/feed-fetcher';
import type { Category, Signal } from '@/lib/types';
import type { ContentItem } from '@/lib/types/assessment';
import { toDateString } from '@/lib/utils/date-utils';

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
  dhspress: Signal[];
  gao: Signal[];
};

/** Maps fetcher group keys to document source_origin values in the DB. */
const GROUP_TO_SOURCE_ORIGIN: Record<string, string> = {
  fr: 'federal_register',
  cl: 'courtlistener',
  doj: 'doj',
  gi: 'govinfo',
  fec: 'fec',
  oig: 'oig',
  dhspress: 'dhs_press',
  gao: 'gao',
};

function groupSignals(signals: Signal[]): GroupedSignals {
  return {
    fr: signals.filter((s) => s.type === 'federal_register'),
    cl: signals.filter((s) => s.type === 'courtlistener'),
    doj: signals.filter((s) => s.type === 'doj_json'),
    gi: signals.filter((s) => s.type === 'govinfo'),
    fec: signals.filter((s) => s.type === 'fec_json'),
    oig: signals.filter((s) => s.type === 'oig_html'),
    dhspress: signals.filter((s) => s.type === 'dhs_press'),
    gao: signals.filter((s) => s.type === 'gao_wayback'),
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

/**
 * Fetch category documents incrementally.
 * Each source fetches from its own last-document date to the given end date.
 *
 * @param sourceDates - Map of source_origin → last document date (from getLastDocumentDateBySource)
 * @param fallbackSince - Used when a source has no stored documents yet
 * @param endDate - End of the fetch range (typically the last day of the completed week)
 */
export async function fetchCategoryIncremental(
  cat: Category,
  sourceDates: Record<string, string>,
  fallbackSince: string,
  endDate?: string,
): Promise<IncrementalFetchResult> {
  const fetchEnd = endDate ?? toDateString(new Date());
  const groups = groupSignals(cat.signals);
  const allItems: ContentItem[] = [];
  const allResults: SignalFetchResult[] = [];

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
    { key: 'dhspress', fn: fetchWeekItemsDhsPress },
    { key: 'gao', fn: fetchWeekItemsGao },
  ];

  for (const { key, fn } of fetchers) {
    const signals = groups[key];
    if (signals.length === 0) continue;
    const sourceOrigin = GROUP_TO_SOURCE_ORIGIN[key];
    const since = sourceDates[sourceOrigin] ?? fallbackSince;
    const week = { start: since, end: fetchEnd };
    const start = Date.now();
    const result = await fn(signals, week, cat.key);
    allItems.push(...result.items);
    allResults.push(sourceResultToSignalResult(signals[0], result, start));
  }

  return { items: allItems, signalResults: allResults };
}
