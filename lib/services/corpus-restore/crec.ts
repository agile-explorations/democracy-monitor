/**
 * CREC restore (#894): every weekday in [from, to], the CREC fetcher's
 * per-day fetch in store-all mode — granules the topic router sends nowhere
 * and whose granuleId is not already stored go to 'corpus'. Procedural and
 * amendment subclasses never come back from the fetcher. Cost: per session
 * day, one granule listing per chamber plus a summary and a text call per
 * substantive granule (routed ones included — the day fetch is all-or-
 * nothing), 200 ms apart. `--max-docs` stops the walk after the day that
 * trips it, so it bounds days walked rather than calls within a day.
 */
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';
import { fetchCrecForDate } from '@/lib/services/crec-fetcher';
import type { CrecChamber } from '@/lib/services/crec-fetcher';
import type { ContentItem } from '@/lib/types';
import { requireGovInfoKey } from './govinfo-key';
import { applyCap, crecGranuleId, isUnroutedCrec, weekdaysBetween } from './plan';
import { getStoredMetadataValues } from './stored-urls';
import type { RestoreBatch, RestoreOptions } from './types';

const CHAMBERS: CrecChamber[] = ['SENATE', 'HOUSE'];

/** Unrouted granules of one day not yet stored (or already seen this run). */
export function selectUnroutedGranules(
  items: ContentItem[],
  excludeGranuleIds: ReadonlySet<string>,
  seen: Set<string>,
): ContentItem[] {
  const selected: ContentItem[] = [];
  for (const item of items) {
    const granuleId = crecGranuleId(item);
    if (!granuleId || excludeGranuleIds.has(granuleId) || seen.has(granuleId)) continue;
    if (!isUnroutedCrec(item)) continue;
    seen.add(granuleId);
    selected.push(item);
  }
  return selected;
}

export async function restoreCrec(opts: RestoreOptions): Promise<RestoreBatch[]> {
  const apiKey = requireGovInfoKey();
  const excludeGranuleIds = await getStoredMetadataValues('granuleId', 'crec', opts);
  const seen = new Set<string>();
  const candidates: ContentItem[] = [];
  let matched = 0;

  for (const date of weekdaysBetween(opts.from, opts.to)) {
    let items: ContentItem[];
    try {
      items = await fetchCrecForDate(date, CHAMBERS, apiKey, { excludeGranuleIds });
    } catch (err) {
      console.warn(`[restore:crec] ${date} failed:`, err);
      continue;
    }
    if (items.length === 0) continue;
    matched += items.length;
    const unrouted = selectUnroutedGranules(items, excludeGranuleIds, seen);
    candidates.push(...unrouted);
    console.log(
      `[restore:crec] ${date}: ${items.length} granules, ${unrouted.length} unrouted new`,
    );
    if (opts.maxDocs !== undefined && candidates.length > opts.maxDocs) break;
  }

  const plan = applyCap(candidates, opts.maxDocs);
  return [
    {
      matched,
      netNew: candidates.length,
      candidates: plan.kept,
      category: CORPUS_CATEGORY,
      capTripped: plan.capTripped,
    },
  ];
}
