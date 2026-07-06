/**
 * API-based CourtListener opinion-first pass.
 *
 * Finds opinions *issued* within a date range (cluster `date_filed`), regardless
 * of when the parent docket was filed, via the CL v4 SEARCH endpoint (type=o) —
 * the opinion analog of `fetchCourtListenerHistorical` (type=r). Replaces the
 * bulk-staging `tryOpinionFirstPass`, which no-ops in production because the
 * staging tables are transient and absent there.
 *
 * Stores the opinion document (type: judicial_opinion) routed to the same
 * categories as the historical staging pass (civilLiberties / lawEnforcement).
 * Dockets themselves continue to be captured by the per-category docket-first
 * fetch; the opinion is linked to its docket via `caseId='cl:<docketId>'`.
 *
 * Opinion text is fetched through the shared `buildOpinionDataFromSubOpinions`
 * helper, so the emitted opinion `link` is byte-identical to the docket-first
 * `fillClOpinions` path — re-storage is an upsert on (url, category), not a
 * duplicate row.
 */

import { routeDocket } from '@/lib/services/cl-bulk-pipeline';
import { backfillOpinionsByDate, isBulkOpinionDbAvailable } from '@/lib/services/cl-bulk-staging';
import {
  buildOpinionContentItem,
  buildOpinionDataFromSubOpinions,
  CL_API_V4,
  CL_BACKFILL_MAX_PAGES,
  FETCH_TIMEOUT_MS,
  getAuthHeaders,
  RATE_LIMIT_DELAY_MS,
} from '@/lib/services/courtlistener-fetcher';
import { storeDocuments } from '@/lib/services/document-store';
import { sleep } from '@/lib/utils/async';

export interface OpinionFirstResult {
  docketsFound: number;
  opinionsStored: number;
}

/** CL search q for the first-amendment branch (mirrors the categories.ts signal). */
export const FIRST_AMENDMENT_QUERY =
  '"first amendment" AND (violation OR injunction OR challenge OR retaliation OR "free speech" OR "free press")';

/** NOS codes queried individually (CL search accepts one nature_of_suit per request). */
const NOS_CODES = ['440', '530', '890'];

/** Keep only federal opinions (jurisdiction codes start with 'F': F, FD, FB, FS). */
function isFederalJurisdiction(code: string | undefined): boolean {
  return !code || code.startsWith('F');
}

const FIRST_AMENDMENT_TEXT_RE = /\bfirst amendment\b/i;

/** A CL v4 search result for type=o (opinion cluster). */
interface OpinionSearchResult {
  cluster_id?: number;
  docket_id?: number;
  caseName?: string;
  court?: string;
  court_jurisdiction?: string;
  suitNature?: string;
  dateFiled?: string;
  opinions?: { id?: number }[];
}

interface ClOpinionSearchResponse {
  next?: string | null;
  results?: OpinionSearchResult[];
}

/** A cluster matched by one or more queries, tracking why (for routing). */
interface MatchedCluster {
  row: OpinionSearchResult;
  nosCodes: Set<string>;
  firstAmendment: boolean;
}

/**
 * Build the CL v4 opinion-search URL: type=o, date range, and either a
 * nature_of_suit filter or a free-text query.
 */
export function buildOpinionSearchUrl(p: {
  nos?: string;
  query?: string;
  dateFrom: string;
  dateTo: string;
}): string {
  const qs = new URLSearchParams();
  qs.set('type', 'o');
  if (p.nos) qs.set('nature_of_suit', p.nos);
  if (p.query) qs.set('q', p.query);
  qs.set('filed_after', p.dateFrom);
  qs.set('filed_before', p.dateTo);
  return `${CL_API_V4}/search/?${qs.toString()}`;
}

/** Paginate one opinion-search query, returning raw cluster rows. */
async function fetchOpinionSearchResults(
  url: string,
  maxPages: number,
): Promise<OpinionSearchResult[]> {
  const rows: OpinionSearchResult[] = [];
  let next: string | null = url;
  let page = 0;

  while (next && page < maxPages) {
    const res = await fetch(next, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      if (page === 0) throw new Error(`[cl-opinion-first] HTTP ${res.status} on page ${page}`);
      console.error(`[cl-opinion-first] HTTP ${res.status} on page ${page}, returning partial`);
      break;
    }
    const data: ClOpinionSearchResponse = await res.json();
    rows.push(...(data.results ?? []));
    next = data.next ?? null;
    page++;
    if (next) await sleep(RATE_LIMIT_DELAY_MS);
  }

  return rows;
}

/** Run all four queries and merge results, deduped by cluster_id. */
async function collectMatchedClusters(
  from: string,
  to: string,
  maxPages: number,
): Promise<MatchedCluster[]> {
  const queries: Array<{ nos?: string; query?: string }> = [
    ...NOS_CODES.map((nos) => ({ nos })),
    { query: FIRST_AMENDMENT_QUERY },
  ];

  const byCluster = new Map<number, MatchedCluster>();
  for (const q of queries) {
    const url = buildOpinionSearchUrl({ ...q, dateFrom: from, dateTo: to });
    let rows: OpinionSearchResult[];
    try {
      rows = await fetchOpinionSearchResults(url, maxPages);
    } catch (err) {
      console.error(`[cl-opinion-first] query failed (${q.nos ?? 'first-amendment'}):`, err);
      continue;
    }
    for (const row of rows) {
      if (!row.cluster_id || !row.docket_id) continue;
      if (!isFederalJurisdiction(row.court_jurisdiction)) continue;
      const existing = byCluster.get(row.cluster_id);
      const match = existing ?? { row, nosCodes: new Set<string>(), firstAmendment: false };
      if (q.nos) match.nosCodes.add(q.nos);
      else match.firstAmendment = true;
      byCluster.set(row.cluster_id, match);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return [...byCluster.values()];
}

/** Categories for a matched cluster: NOS routing ∪ first-amendment → civilLiberties. */
function routeMatchedCluster(match: MatchedCluster, opinionText?: string): string[] {
  const cats = new Set<string>();
  const caseName = match.row.caseName ?? '';
  for (const nos of match.nosCodes) {
    for (const cat of routeDocket(nos, caseName, '')) cats.add(cat);
  }
  if (match.firstAmendment) cats.add('civilLiberties');
  if (cats.size === 0 && opinionText && FIRST_AMENDMENT_TEXT_RE.test(opinionText)) {
    cats.add('civilLiberties');
  }
  return [...cats];
}

/** Extract sub-opinion IDs from a search result. */
function opinionIdsOf(row: OpinionSearchResult): string[] {
  return (row.opinions ?? [])
    .map((o) => o.id)
    .filter((id): id is number => typeof id === 'number')
    .map(String);
}

/**
 * API-based opinion-first pass. Finds opinions filed in [from, to], fetches full
 * text, routes, and stores the opinion document. Date-range capable so it powers
 * both the weekly snapshot and the historical backfill (#527).
 *
 * In dryRun mode it runs the search queries (to report how many clusters match)
 * but skips per-opinion text fetches and DB writes.
 */
export async function apiOpinionFirstPass(
  from: string,
  to: string,
  dryRun: boolean,
  opts: { maxPages?: number } = {},
): Promise<OpinionFirstResult> {
  const maxPages = opts.maxPages ?? CL_BACKFILL_MAX_PAGES;
  const clusters = await collectMatchedClusters(from, to, maxPages);
  console.log(`[cl-opinion-first] ${from}→${to}: ${clusters.length} matched opinion clusters`);

  let docketsFound = 0;
  let opinionsStored = 0;

  for (let i = 0; i < clusters.length; i++) {
    const match = clusters[i];
    const opinionIds = opinionIdsOf(match.row);
    if (opinionIds.length === 0) continue;

    if (dryRun) {
      docketsFound++;
      opinionsStored += routeMatchedCluster(match).length;
      continue;
    }

    const opData = await buildOpinionDataFromSubOpinions(opinionIds, match.row.dateFiled ?? to);
    if (!opData) continue;
    docketsFound++;

    const categories = routeMatchedCluster(match, opData.text);
    if (categories.length === 0) continue;

    const item = buildOpinionContentItem(opData, {
      caseName: match.row.caseName ?? '(untitled case)',
      court: match.row.court ?? 'Federal Court',
      docketId: match.row.docket_id!,
      suitNature: match.row.suitNature || undefined,
    });
    for (const category of categories) {
      opinionsStored += await storeDocuments([item], category);
    }

    if ((i + 1) % 100 === 0) {
      console.log(
        `[cl-opinion-first] ${i + 1}/${clusters.length} clusters, ${opinionsStored} opinions stored`,
      );
    }
  }

  console.log(
    `[cl-opinion-first] Complete: ${docketsFound} opinions, ` +
      `${opinionsStored} docs ${dryRun ? '(dry run)' : 'stored'}`,
  );
  return { docketsFound, opinionsStored };
}

/**
 * Opinion-first dispatcher: use the fast bulk-staging path when its tables are
 * loaded (bulk backfill context), otherwise the CL API (production/snapshot).
 * Drop-in replacement for the former `tryOpinionFirstPass`.
 */
export async function opinionFirstPass(
  from: string,
  to: string,
  dryRun: boolean,
): Promise<OpinionFirstResult> {
  if (await isBulkOpinionDbAvailable()) {
    return backfillOpinionsByDate(from, to, dryRun);
  }
  return apiOpinionFirstPass(from, to, dryRun);
}
