/**
 * Pure planning helpers for the corpus restore (#894): cap semantics, the
 * anti-join arithmetic, per-source candidate selection, and date walking.
 * No I/O — every function here is unit-tested directly.
 */
import { isCorpusComponent } from '@/lib/data/doj-corpus-components';
import type { CpdDocument } from '@/lib/services/cpd-fetcher';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';
import type { ContentItem } from '@/lib/types';
import { addDays } from '@/lib/utils/date-utils';
import type { RestoreBatch } from './types';

export interface CapPlan<T> {
  kept: T[];
  /** More items existed than the cap allowed — the caller must exit 3. */
  capTripped: boolean;
  deferred: number;
}

/** Keep the first `maxDocs` items; report (never hide) the ones left behind. */
export function applyCap<T>(items: T[], maxDocs?: number): CapPlan<T> {
  if (maxDocs === undefined || items.length <= maxDocs) {
    return { kept: items, capTripped: false, deferred: 0 };
  }
  return { kept: items.slice(0, maxDocs), capTripped: true, deferred: items.length - maxDocs };
}

/** Items whose link is not in the stored-URL set (link-less items are dropped). */
export function antiJoinByUrl<T extends { link?: string }>(
  items: T[],
  storedUrls: ReadonlySet<string>,
): T[] {
  return items.filter((item) => !!item.link && !storedUrls.has(item.link));
}

/** Candidates the embedder can use: non-empty content. */
export function countEmbeddable(items: ContentItem[]): number {
  return items.filter((item) => (item.content ?? '').trim().length > 0).length;
}

export interface RestorePrecheck {
  matched: number;
  netNew: number;
  /** Candidates that survived the CLI's final (url, category) anti-join. */
  fetched: number;
  embeddable: number;
}

/** The three precheck numbers (plus fetched) for one batch. */
export function precheckOf(batch: RestoreBatch, fresh: ContentItem[]): RestorePrecheck {
  return {
    matched: batch.matched,
    netNew: batch.netNew,
    fetched: fresh.length,
    embeddable: countEmbeddable(fresh),
  };
}

/** CPD packages the subject mapper routed nowhere — the corpus's share. */
export function selectUnroutedCpd(docs: CpdDocument[]): ContentItem[] {
  return docs.filter((doc) => doc.categories.length === 0).map((doc) => doc.item);
}

/** Minimal DOJ feed release shape the corpus filter needs. */
export interface DojFeedRelease {
  date?: string;
  component?: Array<{ name: string }>;
}

/** DOJ feed `date` is Unix seconds as a string. */
export function dojReleaseDate(release: DojFeedRelease): Date | null {
  if (!release.date) return null;
  const parsed = new Date(parseInt(release.date, 10) * 1000);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Releases inside [fromDate, toDate] that carry a corpus component. */
export function selectCorpusReleases<T extends DojFeedRelease>(
  releases: T[],
  fromDate: Date,
  toDate: Date,
): T[] {
  return releases.filter((release) => {
    const date = dojReleaseDate(release);
    if (!date || date < fromDate || date > toDate) return false;
    return isCorpusComponent((release.component ?? []).map((c) => c.name));
  });
}

/** A CREC granule the topic router sends nowhere. */
export function isUnroutedCrec(item: ContentItem): boolean {
  return classifyCrecToCategories(item.title ?? '', item.content).length === 0;
}

/** Granule id of a CREC item (from the fetcher's metadata), or null. */
export function crecGranuleId(item: ContentItem): string | null {
  const id = item.metadata?.granuleId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Every Monday–Friday date in [from, to], inclusive (CREC never publishes weekends). */
export function weekdaysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(day);
  }
  return days;
}

/** Split [from, to] into consecutive inclusive windows of at most `windowDays`. */
export function splitDateRange(
  from: string,
  to: string,
  windowDays: number,
): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = [];
  for (let start = from; start <= to; start = addDays(start, windowDays)) {
    const end = addDays(start, windowDays - 1);
    windows.push({ from: start, to: end < to ? end : to });
  }
  return windows;
}
