/**
 * Weekly CPD (Compilation of Presidential Documents) pass with a trailing
 * window (#798). GovInfo's `publishdate` is the document's issue date, but
 * GPO loads each package about seven weeks later — the old one-week step
 * asked for last week's documents on the Monday after, found only the
 * admin packages it drops, logged "no new documents", and never looked
 * again: nothing issued after 2026-01-07 was ingested for seven months, with
 * no error. The CHRG pattern applied: query a long trailing window each run,
 * skip packages already stored, cap new fetches, score immediately and run
 * L2 + aggregation on every (category, week) touched; when GovInfo reports
 * nothing at all for the window, say so on the cron error channel.
 */

import { sql } from 'drizzle-orm';
import { runLayersForGroups } from '@/lib/cron/snapshot-layers';
import type { AggregateFailure } from '@/lib/cron/snapshot-layers';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  groupItemsByCategoryWeek,
  splitGroupsByCategory,
} from '@/lib/services/category-week-grouping';
import type { CategoryWeekGroups } from '@/lib/services/category-week-grouping';
import { fetchCpdHistorical, fetchCpdPackageCount } from '@/lib/services/cpd-fetcher';
import type { CpdDocument } from '@/lib/services/cpd-fetcher';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import { storeDocuments } from '@/lib/services/document-store';
import { getLastCompletedWeek } from '@/lib/services/weekly-aggregator';
import { formatError } from '@/lib/utils/api-helpers';
import { addDays, toDateString } from '@/lib/utils/date-utils';

/** Days the pass looks back: GPO's measured load lag is ~7 weeks; 120 days
 *  leaves headroom for holidays and slow quarters. */
export const CPD_TRAILING_WINDOW_DAYS = 120;
/** New packages fetched per run (each costs a summary + a content call). */
export const CPD_WEEKLY_MAX_FETCHES = 300;

/** Package ids of stored CPD documents issued on/after `from` (the anti-join). */
export async function getStoredCpdPackageIds(from: string): Promise<Set<string>> {
  if (!isDbAvailable()) return new Set();
  // nosemgrep: opengrep.cron-needs-env-config — invoked from the snapshot CLI, which loads env
  const rows = await getDb().execute(sql`
    SELECT DISTINCT metadata->>'packageId' AS package_id FROM documents
    WHERE source_origin = 'govinfo_cpd' AND published_at >= ${from}::date
      AND metadata->>'packageId' IS NOT NULL`);
  return new Set((rows.rows as Array<{ package_id: string }>).map((r) => r.package_id));
}

/** Store + score one document across its mapped categories. */
async function storeAndScore(doc: CpdDocument): Promise<number> {
  let stored = 0;
  for (const category of doc.categories) {
    stored += await storeDocuments([doc.item], category);
    await storeDocumentScores(scoreDocumentBatch([doc.item], category));
  }
  return stored;
}

/** Group the new documents by (category, week) for L2 + aggregation — the
 *  shared helper (#825): in-progress-week documents wait for their week's
 *  sweep instead of creating a partial-week aggregate row. */
export function groupByCategoryWeek(
  docs: CpdDocument[],
  anchorWeekOf: string = getLastCompletedWeek(),
): CategoryWeekGroups {
  return groupItemsByCategoryWeek(docs, { anchorWeekOf }).groups;
}

export async function snapshotCpdWindow(errors: string[]): Promise<void> {
  console.log('[snapshot] Fetching CPD presidential documents (trailing window)...');
  try {
    const dateTo = toDateString(new Date());
    const dateFrom = addDays(dateTo, -CPD_TRAILING_WINDOW_DAYS);
    const available = await fetchCpdPackageCount(dateFrom, dateTo);
    if (available === 0) {
      errors.push(
        `CPD: GovInfo returned no packages for ${dateFrom}..${dateTo} — source silent or API change`,
      );
      return;
    }
    const excludePackageIds = await getStoredCpdPackageIds(dateFrom);
    const docs = await fetchCpdHistorical({
      dateFrom,
      dateTo,
      fetchContent: true,
      excludePackageIds,
      maxNewFetches: CPD_WEEKLY_MAX_FETCHES,
    });
    if (docs.length === 0) {
      console.log(`[snapshot] CPD: no new documents (${available} in window, all stored)`);
      return;
    }
    let stored = 0;
    for (const doc of docs) stored += await storeAndScore(doc);
    const anchorWeekOf = getLastCompletedWeek();
    const groups = groupByCategoryWeek(docs, anchorWeekOf);
    const failedAggregates: AggregateFailure[] = [];
    for (const [category, categoryGroups] of splitGroupsByCategory(groups)) {
      await runLayersForGroups(categoryGroups, category, anchorWeekOf, errors, failedAggregates);
    }
    console.log(
      `[snapshot] CPD: ${docs.length} new documents → ${stored} rows across ${groups.size} category-weeks (window ${dateFrom}..${dateTo}: ${available} packages)`,
    );
  } catch (err) {
    errors.push(`CPD fetch failed: ${formatError(err)}`);
    console.error('[snapshot] CPD fetch failed:', err);
  }
}
