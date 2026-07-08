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
import { classifyOpinionToCategories } from '@/lib/services/crec-classifier';
import { storeDocuments } from '@/lib/services/document-store';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

export interface OpinionFirstResult {
  docketsFound: number;
  opinionsStored: number;
}

/** CL search q for the first-amendment branch (mirrors the categories.ts signal). */
export const FIRST_AMENDMENT_QUERY =
  '"first amendment" AND (violation OR injunction OR challenge OR retaliation OR "free speech" OR "free press")';

/** NOS codes queried individually (CL search accepts one nature_of_suit per request). */
const NOS_CODES = ['440', '530', '890'];

/**
 * Court-scoped executive-power queries (#528). The NOS/first-amendment scope
 * above only surfaces district civil-rights material; marquee appellate/SCOTUS
 * executive-power opinions (agency-head removal, birthright citizenship, Alien
 * Enemies Act) fall entirely outside it. These queries capture that layer:
 * every SCOTUS opinion, plus circuit and D.D.C. opinions matching an
 * executive-power text query. Routed by content via
 * classifyOpinionToCategories (not NOS), gated — unrouted opinions are not
 * stored. Volumes verified 2026-07-08 (T2: 207 + 401 + 268 ≈ 12/week).
 */
export const EXEC_POWER_QUERY =
  '"executive order" OR "presidential authority" OR "separation of powers" OR impoundment OR "unitary executive" OR "removal power"';

/** All 13 federal circuit courts (CL court ids), space-separated for the court= param. */
export const CIRCUIT_COURT_IDS = 'ca1 ca2 ca3 ca4 ca5 ca6 ca7 ca8 ca9 ca10 ca11 cadc cafc';

/** Court-scoped queries: key doubles as the metadata.clQueries provenance marker. */
export const COURT_QUERIES: ReadonlyArray<{ key: string; court: string; query?: string }> = [
  { key: 'scotus-all', court: 'scotus' },
  { key: 'circuits-exec', court: CIRCUIT_COURT_IDS, query: EXEC_POWER_QUERY },
  { key: 'dcd-exec', court: 'dcd', query: EXEC_POWER_QUERY },
];

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
  /** COURT_QUERIES keys that surfaced this cluster (content-routed branch). */
  courtQueries: Set<string>;
}

/**
 * Build the CL v4 opinion-search URL: type=o, date range, optional court
 * filter, and either a nature_of_suit filter or a free-text query.
 */
export function buildOpinionSearchUrl(p: {
  nos?: string;
  query?: string;
  court?: string;
  dateFrom: string;
  dateTo: string;
}): string {
  const qs = new URLSearchParams();
  qs.set('type', 'o');
  if (p.nos) qs.set('nature_of_suit', p.nos);
  if (p.query) qs.set('q', p.query);
  if (p.court) qs.set('court', p.court);
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
    const res = await fetchWithRetry(
      next,
      { headers: getAuthHeaders() },
      { label: 'cl-opinion-search', timeoutMs: FETCH_TIMEOUT_MS },
    );
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

/** Run all queries (NOS + first-amendment + court-scoped) and merge, deduped by cluster_id. */
async function collectMatchedClusters(
  from: string,
  to: string,
  maxPages: number,
): Promise<MatchedCluster[]> {
  const queries: Array<{ nos?: string; query?: string; court?: string; courtKey?: string }> = [
    ...NOS_CODES.map((nos) => ({ nos })),
    { query: FIRST_AMENDMENT_QUERY },
    ...COURT_QUERIES.map((cq) => ({ query: cq.query, court: cq.court, courtKey: cq.key })),
  ];

  const byCluster = new Map<number, MatchedCluster>();
  for (const q of queries) {
    const url = buildOpinionSearchUrl({
      nos: q.nos,
      query: q.query,
      court: q.court,
      dateFrom: from,
      dateTo: to,
    });
    let rows: OpinionSearchResult[];
    try {
      rows = await fetchOpinionSearchResults(url, maxPages);
    } catch (err) {
      const label = q.courtKey ?? q.nos ?? 'first-amendment';
      console.error(`[cl-opinion-first] query failed (${label}):`, err);
      continue;
    }
    for (const row of rows) {
      if (!row.cluster_id || !row.docket_id) continue;
      if (!isFederalJurisdiction(row.court_jurisdiction)) continue;
      const existing = byCluster.get(row.cluster_id);
      const match =
        existing ??
        ({
          row,
          nosCodes: new Set<string>(),
          firstAmendment: false,
          courtQueries: new Set<string>(),
        } satisfies MatchedCluster);
      if (q.courtKey) match.courtQueries.add(q.courtKey);
      else if (q.nos) match.nosCodes.add(q.nos);
      else match.firstAmendment = true;
      byCluster.set(row.cluster_id, match);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return [...byCluster.values()];
}

/**
 * Categories for a matched cluster: NOS routing ∪ first-amendment ∪ (for
 * court-scoped matches) content classification over caseName + opinion head.
 * Court-scoped matches with no classified category are NOT stored — the court
 * query alone is no relevance guarantee ("separation of powers" appears
 * rhetorically in ordinary opinions). In dry-run mode (no opinion text) the
 * content branch classifies on caseName only, so counts are lower bounds.
 */
function routeMatchedCluster(match: MatchedCluster, opinionText?: string): string[] {
  const cats = new Set<string>();
  const caseName = match.row.caseName ?? '';
  for (const nos of match.nosCodes) {
    for (const cat of routeDocket(nos, caseName, '')) cats.add(cat);
  }
  if (match.firstAmendment) cats.add('civilLiberties');
  if (match.courtQueries.size > 0) {
    for (const cat of classifyOpinionToCategories(caseName, opinionText)) cats.add(cat);
  }
  if (cats.size === 0 && opinionText && FIRST_AMENDMENT_TEXT_RE.test(opinionText)) {
    cats.add('civilLiberties');
  }
  return [...cats];
}

/** Provenance markers for metadata.clQueries (audit + targeted purge handle). */
function provenanceOf(match: MatchedCluster): string[] {
  return [
    ...[...match.nosCodes].map((nos) => `nos:${nos}`),
    ...(match.firstAmendment ? ['first-amendment'] : []),
    ...match.courtQueries,
  ];
}

/** Per-provenance match/unrouted counters for the completion log. */
function createQueryStats() {
  const stats = new Map<string, { matched: number; unrouted: number }>();
  return {
    bump(match: MatchedCluster, routedCount: number): void {
      for (const key of provenanceOf(match)) {
        const s = stats.get(key) ?? { matched: 0, unrouted: 0 };
        s.matched++;
        if (routedCount === 0) s.unrouted++;
        stats.set(key, s);
      }
    },
    summary(): string {
      return [...stats.entries()]
        .map(([key, s]) => `${key}=${s.matched}${s.unrouted ? ` (${s.unrouted} unrouted)` : ''}`)
        .join(', ');
    },
  };
}

/** Extract sub-opinion IDs from a search result. */
function opinionIdsOf(row: OpinionSearchResult): string[] {
  return (row.opinions ?? [])
    .map((o) => o.id)
    .filter((id): id is number => typeof id === 'number')
    .map(String);
}

/** Fetch one cluster's opinion text, route, and store it. Returns clusters found
 *  (1 if substantive opinion text was retrieved) and documents stored. */
async function storeClusterOpinion(
  match: MatchedCluster,
  fallbackDate: string,
): Promise<{ found: number; stored: number }> {
  const opinionIds = opinionIdsOf(match.row);
  const opData = await buildOpinionDataFromSubOpinions(
    opinionIds,
    match.row.dateFiled ?? fallbackDate,
  );
  if (!opData) return { found: 0, stored: 0 };

  const categories = routeMatchedCluster(match, opData.text);
  if (categories.length === 0) return { found: 1, stored: 0 };

  const item = buildOpinionContentItem(opData, {
    caseName: match.row.caseName ?? '(untitled case)',
    court: match.row.court ?? 'Federal Court',
    docketId: match.row.docket_id!,
    suitNature: match.row.suitNature || undefined,
    clQueries: provenanceOf(match),
  });
  let stored = 0;
  for (const category of categories) stored += await storeDocuments([item], category);
  return { found: 1, stored };
}

/**
 * API-based opinion-first pass. Finds opinions filed in [from, to], fetches full
 * text, routes, and stores the opinion document. Date-range capable so it powers
 * both the weekly snapshot and the historical backfill (#527).
 *
 * A per-cluster failure (e.g. a CL API fetch timeout) is logged and skipped so a
 * single slow request never aborts the whole pass — important over the thousands
 * of fetches a multi-week backfill makes, and to keep the weekly snapshot robust.
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
  const stats = createQueryStats();

  for (let i = 0; i < clusters.length; i++) {
    const match = clusters[i];
    const opinionIds = opinionIdsOf(match.row);
    if (opinionIds.length === 0) continue;

    if (dryRun) {
      const routed = routeMatchedCluster(match).length;
      stats.bump(match, routed);
      docketsFound++;
      opinionsStored += routed;
      continue;
    }

    try {
      const { found, stored } = await storeClusterOpinion(match, to);
      if (found > 0) stats.bump(match, stored);
      docketsFound += found;
      opinionsStored += stored;
    } catch (err) {
      console.warn(
        `[cl-opinion-first] cluster ${match.row.cluster_id} skipped: ${(err as Error).message}`,
      );
    }

    if ((i + 1) % 100 === 0) {
      console.log(
        `[cl-opinion-first] ${i + 1}/${clusters.length} clusters, ${opinionsStored} opinions stored`,
      );
    }
  }

  const statsLine = stats.summary();
  console.log(
    `[cl-opinion-first] Complete: ${docketsFound} opinions, ` +
      `${opinionsStored} docs ${dryRun ? '(dry run; court-query routing is caseName-only)' : 'stored'}` +
      (statsLine ? ` | ${statsLine}` : ''),
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
