/**
 * CPD restore (#894): packages the NARA subject mapper routes nowhere. The
 * CPD fetcher now returns them with `categories: []` (#892) instead of
 * skipping; this restore keeps exactly those and leaves routed packages to
 * the normal backfill. Walked in half-year windows so each search stays
 * under the fetcher's 20-page ceiling. Cost per enriched package: one
 * summary + one content call, 200 ms apart. `--max-docs` bounds packages
 * ENRICHED (routed and unrouted alike — that is where the calls go), so the
 * stored count can be lower than the cap.
 */
import { getStoredCpdPackageIds } from '@/lib/cron/snapshot-cpd';
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';
import { fetchCpdHistorical } from '@/lib/services/cpd-fetcher';
import type { ContentItem } from '@/lib/types';
import { requireGovInfoKey } from './govinfo-key';
import { applyCap, selectUnroutedCpd, splitDateRange } from './plan';
import type { RestoreBatch, RestoreOptions } from './types';

/** ~1,000 packages per window at CPD's publication rate — ten search pages. */
const CPD_WINDOW_DAYS = 182;

export async function restoreCpd(opts: RestoreOptions): Promise<RestoreBatch[]> {
  requireGovInfoKey();
  const excludePackageIds = await getStoredCpdPackageIds(opts.from);
  const candidates: ContentItem[] = [];
  let enriched = 0;
  let capTripped = false;

  for (const window of splitDateRange(opts.from, opts.to, CPD_WINDOW_DAYS)) {
    const remaining = opts.maxDocs === undefined ? undefined : opts.maxDocs - enriched;
    // One past the cap so a trip is observable, not inferred from an exact count.
    const docs = await fetchCpdHistorical({
      dateFrom: window.from,
      dateTo: window.to,
      fetchContent: true,
      excludePackageIds,
      maxNewFetches: remaining === undefined ? undefined : remaining + 1,
    });
    const plan = applyCap(docs, remaining);
    enriched += plan.kept.length;
    const unrouted = selectUnroutedCpd(plan.kept);
    candidates.push(...unrouted);
    console.log(
      `[restore:cpd] ${window.from}..${window.to}: ${plan.kept.length} enriched, ${unrouted.length} unrouted`,
    );
    if (plan.capTripped) {
      capTripped = true;
      break;
    }
  }

  return [
    {
      matched: enriched,
      netNew: candidates.length,
      candidates,
      category: CORPUS_CATEGORY,
      capTripped,
    },
  ];
}
