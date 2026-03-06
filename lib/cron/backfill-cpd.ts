/** CPD backfill — fetch and store presidential documents with subject-based category routing. */

import { fetchCpdHistorical } from '@/lib/services/cpd-fetcher';
import type { CpdDocument } from '@/lib/services/cpd-fetcher';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';

interface WeekRange {
  start: string;
  end: string;
}

/**
 * Store a CPD document in each of its mapped categories.
 * Returns the total number of rows stored (one per category).
 */
async function storeCpdDocument(doc: CpdDocument): Promise<number> {
  let stored = 0;
  for (const category of doc.categories) {
    const count = await storeDocuments([doc.item], category);
    stored += count;
  }
  return stored;
}

/**
 * Score CPD documents per category and update weekly aggregates.
 * Groups items by category for efficient batch scoring.
 */
async function scoreCpdDocuments(docs: CpdDocument[], affectedWeeks: Set<string>): Promise<void> {
  // Group items by category
  const byCategory = new Map<string, ContentItem[]>();
  for (const doc of docs) {
    for (const cat of doc.categories) {
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(doc.item);
    }
  }

  // Score and aggregate per category
  for (const [category, items] of byCategory) {
    await storeDocumentScores(scoreDocumentBatch(items, category));
    for (const weekStart of affectedWeeks) {
      await storeWeeklyAggregate(await computeWeeklyAggregate(category, weekStart));
    }
  }
}

/**
 * Backfill CPD documents for a set of weekly ranges.
 *
 * Fetches all CPD packages per week, maps subjects to categories,
 * stores each document in its mapped categories, scores, and aggregates.
 */
export async function backfillCpd(weeks: WeekRange[], dryRun: boolean): Promise<number> {
  console.log('\n[backfill] === CPD (Presidential Documents) ===');
  let totalStored = 0;

  if (dryRun) {
    console.log(`  CPD: [dry run] would fetch ${weeks.length} weeks from GovInfo DCPD collection`);
    return 0;
  }

  for (const week of weeks) {
    try {
      const docs = await fetchCpdHistorical({
        dateFrom: week.start,
        dateTo: week.end,
        fetchContent: true,
      });

      if (docs.length === 0) {
        console.log(`  CPD ${week.start}: 0 documents`);
        continue;
      }

      // Store each document in its mapped categories
      let weekStored = 0;
      for (const doc of docs) {
        weekStored += await storeCpdDocument(doc);
      }

      // Score and aggregate
      const affectedWeeks = new Set([week.start]);
      await scoreCpdDocuments(docs, affectedWeeks);

      totalStored += weekStored;
      console.log(
        `  CPD ${week.start}: ${docs.length} documents → ${weekStored} category entries stored`,
      );
    } catch (err) {
      console.error(`  CPD error for ${week.start}: ${formatError(err)}`);
    }
  }

  console.log(`  CPD: ${totalStored} total category entries stored`);
  return totalStored;
}
