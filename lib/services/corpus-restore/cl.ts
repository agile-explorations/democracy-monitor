/**
 * CourtListener restore (#894): opinion clusters the opinion-first pass read
 * and routed nowhere (cl_cluster_ledger reason 'zero_categories'). Each
 * cluster costs one clusters call plus one call per sub-opinion (2 s apart
 * — the fetcher's RATE_LIMIT_DELAY_MS; CL allows ~5k/hr). Stored under
 * 'corpus' with the same opinionUrl the routed path would have used.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';
import { clClusterLedger } from '@/lib/db/schema';
import {
  buildOpinionContentItem,
  buildOpinionDataFromSubOpinions,
  CL_API_V4,
  FETCH_TIMEOUT_MS,
  getAuthHeaders,
  RATE_LIMIT_DELAY_MS,
} from '@/lib/services/courtlistener-fetcher';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';
import { applyCap } from './plan';
import { getStoredMetadataValues } from './stored-urls';
import type { RestoreBatch, RestoreOptions } from './types';

const ZERO_CATEGORIES = 'zero_categories';

interface LedgerCluster {
  clusterId: number;
  docketId: number | null;
  court: string | null;
  caseName: string | null;
  dateFiled: string | null;
}

interface ClClusterDetail {
  case_name?: string;
  date_filed?: string;
  sub_opinions?: string[];
}

/** Opinion ids from CL sub_opinions URLs ("/api/rest/v4/opinions/12345/"). */
export function opinionIdsFromUrls(urls: string[]): string[] {
  return urls
    .map((url) => url.match(/\/opinions\/(\d+)\//)?.[1] ?? null)
    .filter((id): id is string => id !== null);
}

async function fetchClusterDetail(clusterId: number): Promise<ClClusterDetail | null> {
  const url = `${CL_API_V4}/clusters/${clusterId}/?fields=id,case_name,date_filed,sub_opinions`;
  const res = await fetchWithRetry(
    url,
    { headers: getAuthHeaders() },
    { label: 'cl-cluster', timeoutMs: FETCH_TIMEOUT_MS },
  );
  if (!res.ok) {
    console.warn(`[restore:cl] HTTP ${res.status} for cluster ${clusterId}`);
    return null;
  }
  return (await res.json()) as ClClusterDetail;
}

/** Cluster → opinion ContentItem via the fetchers' shared helpers, or null. */
async function fetchClusterOpinion(row: LedgerCluster): Promise<ContentItem | null> {
  const cluster = await fetchClusterDetail(row.clusterId);
  if (!cluster) return null;
  const opinionIds = opinionIdsFromUrls(cluster.sub_opinions ?? []);
  const dateFiled = cluster.date_filed ?? row.dateFiled;
  if (opinionIds.length === 0 || !dateFiled || row.docketId === null) return null;
  const opinion = await buildOpinionDataFromSubOpinions(opinionIds, dateFiled);
  if (!opinion) return null;
  return buildOpinionContentItem(opinion, {
    caseName: cluster.case_name ?? row.caseName ?? '(untitled case)',
    court: row.court ?? 'Federal Court',
    docketId: row.docketId,
    clusterId: row.clusterId,
  });
}

async function loadZeroCategoryClusters(): Promise<LedgerCluster[]> {
  return getDb()
    .select({
      clusterId: clClusterLedger.clusterId,
      docketId: clClusterLedger.docketId,
      court: clClusterLedger.court,
      caseName: clClusterLedger.caseName,
      dateFiled: clClusterLedger.dateFiled,
    })
    .from(clClusterLedger)
    .where(eq(clClusterLedger.reason, ZERO_CATEGORIES))
    .orderBy(clClusterLedger.clusterId);
}

export async function restoreCl(opts: RestoreOptions): Promise<RestoreBatch[]> {
  const rows = await loadZeroCategoryClusters();
  const storedClusters = await getStoredMetadataValues('clusterId', 'courtlistener');
  const fresh = rows.filter((r) => !storedClusters.has(String(r.clusterId)));
  const withDocket = fresh.filter((r) => r.docketId !== null);
  if (withDocket.length < fresh.length) {
    console.warn(
      `[restore:cl] ${fresh.length - withDocket.length} ledger row(s) lack a docket id — skipped`,
    );
  }
  const plan = applyCap(withDocket, opts.maxDocs);
  console.log(
    `[restore:cl] ${rows.length} zero-category clusters, ${withDocket.length} not yet stored; fetching ${plan.kept.length}`,
  );

  const candidates: ContentItem[] = [];
  for (const row of plan.kept) {
    try {
      const item = await fetchClusterOpinion(row);
      if (item) candidates.push(item);
      else console.warn(`[restore:cl] cluster ${row.clusterId}: no substantive opinion text`);
    } catch (err) {
      console.warn(`[restore:cl] cluster ${row.clusterId} failed:`, err);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return [
    {
      matched: rows.length,
      netNew: withDocket.length,
      candidates,
      category: CORPUS_CATEGORY,
      capTripped: plan.capTripped,
    },
  ];
}
