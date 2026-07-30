/**
 * GovInfo CHRG (congressional hearing transcript) fetcher (#608).
 *
 * Hearings are fetched via the search API scoped to the owner-approved
 * committee list, then classified to categories by content (see
 * classifyHearingToCategories) — committee is captured as metadata and used
 * as a routing cross-check, never as a routing rule.
 *
 * dateIssued on CHRG packages is the hearing HELD date; transcripts publish
 * months later, so callers query a trailing window and anti-join against
 * already-stored packageIds rather than fetching "last week".
 */

import { searchGovInfo, fetchGovInfoText } from '@/lib/services/govinfo-fetcher';
import type { GovInfoSearchResult } from '@/lib/services/govinfo-fetcher';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const RATE_LIMIT_DELAY_MS = 200;
const SEARCH_PAGE_SIZE = 100;
const MAX_SEARCH_PAGES = 60;

/** How far back the weekly snapshot re-queries for late-published transcripts. */
export const CHRG_TRAILING_WINDOW_DAYS = 540;

/**
 * Owner-approved committee scope (R-CHRG decision 1). `search` is the govinfo
 * committee facet query; `label` is the tag stored in metadata.chrgCommittees.
 */
export const CHRG_COMMITTEES: ReadonlyArray<{ search: string; label: string }> = [
  { search: 'judiciary', label: 'Judiciary' },
  { search: '"homeland security"', label: 'Homeland Security' },
  { search: 'oversight', label: 'Oversight' },
  { search: 'appropriations', label: 'Appropriations' },
  { search: '"armed services"', label: 'Armed Services' },
  { search: 'administration', label: 'Administration' },
  { search: 'intelligence', label: 'Intelligence' },
];

export interface ChrgPackage {
  packageId: string;
  title: string;
  dateIssued: string;
  /** Committee scope tags whose facet queries returned this package. */
  committees: string[];
}

export function chrgPackageUrl(packageId: string): string {
  return `https://www.govinfo.gov/app/details/${packageId}`;
}

/**
 * govinfo publishes hearing corrections as separate [ERRATA] packages (seen
 * live: "[ERRATA] OVERSIGHT OF THE U.S. DEPARTMENT OF JUSTICE…"). They are
 * short stubs duplicating a real transcript's title — skipped before text
 * fetch, so re-listing them each window costs nothing.
 */
export function isErrataPackage(title: string): boolean {
  return /\[\s*errata\s*\]/i.test(title);
}

/** Convert a CHRG package + fetched transcript text into a ContentItem. */
export function toContentItem(pkg: ChrgPackage, text: string | null): ContentItem {
  return {
    title: pkg.title,
    link: chrgPackageUrl(pkg.packageId),
    pubDate: pkg.dateIssued,
    agency: 'U.S. Congress',
    content: text ?? undefined,
    type: 'hearing_transcript',
    sourceOrigin: 'chrg',
    metadata: { packageId: pkg.packageId, collectionCode: 'CHRG', chrgCommittees: pkg.committees },
  };
}

/** Merge per-committee search batches: dedupe joint hearings, union committee tags. */
export function mergeCommitteeBatches(
  batches: Array<{ committee: string; results: GovInfoSearchResult[] }>,
): ChrgPackage[] {
  const byId = new Map<string, ChrgPackage>();
  for (const batch of batches) {
    for (const result of batch.results) {
      if (!result.packageId || !result.dateIssued) continue;
      const existing = byId.get(result.packageId);
      if (existing) {
        if (!existing.committees.includes(batch.committee)) {
          existing.committees.push(batch.committee);
        }
        continue;
      }
      byId.set(result.packageId, {
        packageId: result.packageId,
        title: result.title || '(untitled hearing)',
        dateIssued: result.dateIssued,
        committees: [batch.committee],
      });
    }
  }
  return [...byId.values()];
}

/** Paginate one committee's CHRG search over a date range. */
async function searchCommittee(
  committee: { search: string; label: string },
  dateFrom: string,
  dateTo: string,
  apiKey: string,
): Promise<{ committee: string; results: GovInfoSearchResult[] }> {
  const query = `collection:(CHRG) AND committee:(${committee.search}) AND publishdate:range(${dateFrom},${dateTo})`;
  const results: GovInfoSearchResult[] = [];
  let offsetMark = '*';

  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const data = await searchGovInfo(query, apiKey, SEARCH_PAGE_SIZE, offsetMark);
    results.push(...(data.results || []));
    if (!data.offsetMark || (data.results || []).length < SEARCH_PAGE_SIZE) break;
    offsetMark = data.offsetMark;
    await sleep(RATE_LIMIT_DELAY_MS);
  }
  return { committee: committee.label, results };
}

/** Search all scoped committees for hearings issued within [dateFrom, dateTo]. */
export async function searchChrgPackages(params: {
  dateFrom: string;
  dateTo: string;
}): Promise<ChrgPackage[]> {
  const apiKey = process.env.GOVINFO_API_KEY;
  if (!apiKey) {
    console.log('[chrg] GOVINFO_API_KEY not set, skipping fetch');
    return [];
  }

  const batches = [];
  for (const committee of CHRG_COMMITTEES) {
    batches.push(await searchCommittee(committee, params.dateFrom, params.dateTo, apiKey));
    await sleep(RATE_LIMIT_DELAY_MS);
  }
  const merged = mergeCommitteeBatches(batches);
  console.log(
    `  [chrg] ${merged.length} hearings in range across ${CHRG_COMMITTEES.length} committees`,
  );
  return merged;
}

/**
 * Fetch hearings in the window whose packageIds are not yet stored or
 * ledgered, with transcript text. maxNewFetches bounds weekly work.
 */
export async function fetchChrgWindow(params: {
  dateFrom: string;
  dateTo: string;
  excludePackageIds: Set<string>;
  maxNewFetches?: number;
}): Promise<ContentItem[]> {
  const packages = await searchChrgPackages(params);
  const errata = packages.filter((p) => isErrataPackage(p.title));
  if (errata.length > 0) console.log(`  [chrg] skipping ${errata.length} [ERRATA] stubs`);
  const fresh = packages.filter(
    (p) => !isErrataPackage(p.title) && !params.excludePackageIds.has(p.packageId),
  );
  const bounded = params.maxNewFetches !== undefined ? fresh.slice(0, params.maxNewFetches) : fresh;
  if (bounded.length < fresh.length) {
    console.log(`  [chrg] bounding to ${bounded.length}/${fresh.length} new hearings this run`);
  }

  const items: ContentItem[] = [];
  for (const pkg of bounded) {
    const text = await fetchGovInfoText(pkg.packageId);
    items.push(toContentItem(pkg, text));
    await sleep(RATE_LIMIT_DELAY_MS);
  }
  console.log(`  [chrg] fetched text for ${items.length} new hearings`);
  return items;
}
