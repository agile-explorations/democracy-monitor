/**
 * CREC backfill — fetch Congressional Record floor speeches and route to categories.
 *
 * CREC is a cross-cutting source: each speech is classified into zero or more
 * monitoring categories via keyword matching, then stored once per matched category.
 * Follows the same pattern as backfill-cpd.ts.
 */

import { classifyCrecToCategories } from '@/lib/services/crec-classifier';
import type { CrecChamber } from '@/lib/services/crec-fetcher';
import { fetchCrecHistorical } from '@/lib/services/crec-fetcher';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';

interface WeekRange {
  start: string;
  end: string;
}

export interface CrecRoutedItem {
  item: ContentItem;
  categories: string[];
}

const DEFAULT_CHAMBERS: CrecChamber[] = ['SENATE', 'HOUSE'];

/**
 * Classify CREC items into categories and return routed items.
 * Items that match zero categories are dropped (procedural noise that passed filters).
 */
export function routeItemsToCategories(items: ContentItem[]): CrecRoutedItem[] {
  const routed: CrecRoutedItem[] = [];

  for (const item of items) {
    const text = item.content || '';
    const categories = classifyCrecToCategories(item.title || '', text);
    if (categories.length === 0) continue;

    routed.push({ item, categories });
  }

  return routed;
}

/**
 * Store a CREC document in each of its matched categories.
 * Populates the `speaker` column from metadata.
 */
async function storeCrecDocument(doc: CrecRoutedItem): Promise<number> {
  let stored = 0;
  for (const category of doc.categories) {
    const count = await storeDocuments([doc.item], category);
    stored += count;
  }
  return stored;
}

/**
 * Score CREC documents per category and update weekly aggregates.
 */
async function scoreCrecDocuments(
  docs: CrecRoutedItem[],
  affectedWeeks: Set<string>,
): Promise<void> {
  const byCategory = new Map<string, ContentItem[]>();
  for (const doc of docs) {
    for (const cat of doc.categories) {
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(doc.item);
    }
  }

  for (const [category, items] of byCategory) {
    await storeDocumentScores(scoreDocumentBatch(items, category));
    for (const weekStart of affectedWeeks) {
      await storeWeeklyAggregate(await computeWeeklyAggregate(category, weekStart));
    }
  }
}

/**
 * Backfill CREC documents for a set of weekly ranges.
 *
 * For each week: fetch all CREC floor speeches across both chambers,
 * classify into monitoring categories, store per category, score, aggregate.
 */
export async function backfillCrec(weeks: WeekRange[], dryRun: boolean): Promise<number> {
  console.log('\n[backfill] === CREC (Congressional Record) ===');
  let totalStored = 0;

  if (dryRun) {
    console.log(`  CREC: [dry run] would fetch ${weeks.length} weeks from GovInfo Granules API`);
    return 0;
  }

  for (const week of weeks) {
    try {
      const items = await fetchCrecHistorical({
        chambers: DEFAULT_CHAMBERS,
        dateFrom: week.start,
        dateTo: week.end,
      });

      if (items.length === 0) {
        console.log(`  CREC ${week.start}: 0 entries`);
        continue;
      }

      const routed = routeItemsToCategories(items);
      if (routed.length === 0) {
        console.log(`  CREC ${week.start}: ${items.length} entries, 0 matched categories`);
        continue;
      }

      let weekStored = 0;
      for (const doc of routed) {
        weekStored += await storeCrecDocument(doc);
      }

      const affectedWeeks = new Set([week.start]);
      await scoreCrecDocuments(routed, affectedWeeks);

      const categoryCounts = new Map<string, number>();
      for (const doc of routed) {
        for (const cat of doc.categories) {
          categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
        }
      }

      totalStored += weekStored;
      console.log(
        `  CREC ${week.start}: ${items.length} entries → ${routed.length} classified → ` +
          `${weekStored} category entries (${categoryCounts.size} categories)`,
      );
    } catch (err) {
      console.error(`  CREC error for ${week.start}: ${formatError(err)}`);
    }
  }

  console.log(`  CREC: ${totalStored} total category entries stored`);
  return totalStored;
}
