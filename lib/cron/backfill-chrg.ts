/**
 * CHRG backfill — fetch congressional hearing transcripts and route to categories.
 *
 * Unlike CREC's per-week loop, CHRG runs ONE windowed pass: hearings are
 * sparse, the search API is date-ranged, and dateIssued (the hearing HELD
 * date) can be months before the transcript publishes — so the caller passes
 * a window and the anti-join keeps re-runs incremental.
 */

import { eq } from 'drizzle-orm';
import { runLayersForGroups } from '@/lib/cron/snapshot-layers';
import type { AggregateFailure } from '@/lib/cron/snapshot-layers';
import { getDb, isDbAvailable } from '@/lib/db';
import { chrgSeenLedger, documents } from '@/lib/db/schema';
import {
  groupItemsByCategoryWeek,
  parseCategoryWeekKey,
  splitGroupsByCategory,
} from '@/lib/services/category-week-grouping';
import { CHRG_TRAILING_WINDOW_DAYS, fetchChrgWindow } from '@/lib/services/chrg-fetcher';
import { classifyHearingToCategories } from '@/lib/services/crec-classifier';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import {
  computeWeeklyAggregate,
  getLastCompletedWeek,
  getWeekOfDate,
  storeWeeklyAggregate,
} from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';
import { addDays, toDateString } from '@/lib/utils/date-utils';

export interface ChrgRoutedItem {
  item: ContentItem;
  categories: string[];
}

/**
 * Classify hearings into categories. Zero-category and text-less hearings are
 * returned separately so the caller can ledger them (auditable drops that are
 * never re-fetched).
 */
export function routeHearingsToCategories(items: ContentItem[]): {
  routed: ChrgRoutedItem[];
  dropped: Array<{ item: ContentItem; reason: 'zero_categories' | 'no_text' }>;
} {
  const routed: ChrgRoutedItem[] = [];
  const dropped: Array<{ item: ContentItem; reason: 'zero_categories' | 'no_text' }> = [];

  for (const item of items) {
    if (!item.content) {
      dropped.push({ item, reason: 'no_text' });
      continue;
    }
    const categories = classifyHearingToCategories(item.title || '', item.content);
    if (categories.length === 0) {
      dropped.push({ item, reason: 'zero_categories' });
      continue;
    }
    routed.push({ item, categories });
  }

  return { routed, dropped };
}

/** packageIds already stored as documents or ledgered as deliberate drops. */
export async function getStoredChrgPackageIds(): Promise<Set<string>> {
  if (!isDbAvailable()) return new Set();
  const db = getDb();

  const stored = await db
    .selectDistinct({ url: documents.url })
    .from(documents)
    .where(eq(documents.sourceOrigin, 'chrg'));
  const ledgered = await db.select({ packageId: chrgSeenLedger.packageId }).from(chrgSeenLedger);

  const ids = new Set<string>();
  for (const row of stored) {
    const id = row.url?.split('/').pop();
    if (id) ids.add(id);
  }
  for (const row of ledgered) ids.add(row.packageId);
  return ids;
}

/** Record dropped hearings so weekly re-queries skip them permanently. */
export async function ledgerDroppedHearings(
  dropped: Array<{ item: ContentItem; reason: string }>,
): Promise<void> {
  if (dropped.length === 0 || !isDbAvailable()) return;
  const db = getDb();
  for (const { item, reason } of dropped) {
    const packageId = (item.metadata?.packageId as string) || '';
    if (!packageId) continue;
    await db
      .insert(chrgSeenLedger)
      .values({
        packageId,
        title: item.title || '(untitled hearing)',
        committees: ((item.metadata?.chrgCommittees as string[]) || []).join(','),
        dateIssued: item.pubDate?.slice(0, 10),
        reason,
      })
      .onConflictDoNothing();
  }
}

/** Store + score per matched category (every week the batch touches). */
export async function storeAndScoreHearings(routed: ChrgRoutedItem[]): Promise<number> {
  let stored = 0;
  for (const doc of routed) {
    for (const category of doc.categories) {
      stored += await storeDocuments([doc.item], category);
      await storeDocumentScores(scoreDocumentBatch([doc.item], category));
    }
  }
  return stored;
}

/** Backfill-only: bare count aggregates for every (category, week) touched —
 *  the owner-run CLI passes an explicit window, so baseline weeks are an
 *  acknowledged write here (unlike the weekly snapshot, #825). */
async function aggregateTouchedWeeks(routed: ChrgRoutedItem[]): Promise<number> {
  const touched = new Set<string>();
  for (const doc of routed) {
    const weekOf = getWeekOfDate(doc.item.pubDate);
    for (const category of doc.categories) touched.add(`${category}|${weekOf}`);
  }
  for (const key of touched) {
    const { category, weekOf } = parseCategoryWeekKey(key);
    await storeWeeklyAggregate(await computeWeeklyAggregate(category, weekOf));
  }
  return touched.size;
}

/** New hearings a single weekly run will fetch at most (~30 min of polite fetching). */
const CHRG_WEEKLY_MAX_FETCHES = 120;

/**
 * Weekly snapshot pass: fetch newly published transcripts across the trailing
 * window. CHRG dateIssued is the hearing HELD date and transcripts publish
 * months late, so new documents land in OLD weeks — outside the snapshot's
 * 2-week trailing sweep. This pass therefore re-derives (L2 + aggregate)
 * every current-term (category, week) it touches via runLayersForGroups;
 * baseline weeks are reported for owner-approved repair (#825).
 */
export async function snapshotChrgWindow(errors: string[] = []): Promise<void> {
  console.log('[snapshot] Fetching CHRG (hearing transcripts)...');
  try {
    const dateTo = toDateString(new Date());
    const dateFrom = addDays(dateTo, -CHRG_TRAILING_WINDOW_DAYS);
    const excludePackageIds = await getStoredChrgPackageIds();
    const items = await fetchChrgWindow({
      dateFrom,
      dateTo,
      excludePackageIds,
      maxNewFetches: CHRG_WEEKLY_MAX_FETCHES,
    });
    if (items.length === 0) {
      console.log('[snapshot] CHRG: no newly published hearings');
      return;
    }

    const { routed, dropped } = routeHearingsToCategories(items);
    await ledgerDroppedHearings(dropped);
    const stored = await storeAndScoreHearings(routed);

    const anchorWeekOf = getLastCompletedWeek();
    const { groups } = groupItemsByCategoryWeek(routed, { anchorWeekOf });
    // Aggregate failures are already on the error channel via runLayersAndAggregate;
    // there is no per-category retry outside the main loop.
    const failedAggregates: AggregateFailure[] = [];
    for (const [category, categoryGroups] of splitGroupsByCategory(groups)) {
      await runLayersForGroups(categoryGroups, category, anchorWeekOf, errors, failedAggregates);
    }

    console.log(
      `[snapshot] CHRG: ${items.length} new transcripts → ${routed.length} routed ` +
        `(${dropped.length} ledgered) → ${stored} rows across ${groups.size} category-weeks`,
    );
  } catch (err) {
    console.error('[snapshot] CHRG fetch failed:', err);
  }
}

/** Backfill CHRG hearings for a date window: search → anti-join → route → store. */
export async function backfillChrg(from: string, to: string, dryRun: boolean): Promise<number> {
  console.log('\n[backfill] === CHRG (Congressional Hearings) ===');

  if (dryRun) {
    console.log(`  CHRG: [dry run] would search ${from} → ${to} across scoped committees`);
    return 0;
  }

  try {
    const excludePackageIds = await getStoredChrgPackageIds();
    const items = await fetchChrgWindow({ dateFrom: from, dateTo: to, excludePackageIds });
    if (items.length === 0) {
      console.log('  CHRG: no new hearings in window');
      return 0;
    }

    const { routed, dropped } = routeHearingsToCategories(items);
    await ledgerDroppedHearings(dropped);
    const stored = await storeAndScoreHearings(routed);
    const weeks = await aggregateTouchedWeeks(routed);

    console.log(
      `  CHRG: ${items.length} new hearings → ${routed.length} routed, ` +
        `${dropped.length} ledgered → ${stored} category entries across ${weeks} category-weeks`,
    );
    return stored;
  } catch (err) {
    console.error(`  CHRG error: ${formatError(err)}`);
    return 0;
  }
}
