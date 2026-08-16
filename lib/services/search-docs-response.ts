/**
 * docsOnly response helpers for /api/search (split from the route for size):
 * cache refs + cached serve, the build response with phase timings (#726),
 * the zero-result response, and the degradation/behavior rows (#727).
 */

import { createHash } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import type {
  CandidateSummary,
  RetrievalResult,
  RetrievalTimings,
} from '@/lib/services/research-doc-retrieval';
import { buildDebugTrace } from '@/lib/services/search-debug-trace';
import {
  buildDocsOnlyPayload,
  emptyResearchResponse,
  hashDocsKey,
} from '@/lib/services/search-response-format';
import { recordSearchTiming } from '@/lib/services/search-timing-log';

/** docsOnly doc lists change only when data does (Monday snapshot); the
 *  pre-warm workflow refreshes them right after (&refresh=true). */
const RESEARCH_DOCS_CACHE_TTL = 7 * 86400;

export function hashQuery(q: string): string {
  return createHash('sha256').update(q.toLowerCase().trim()).digest('hex').slice(0, 16);
}

/** docsOnly cache refs: the bare hash also travels to the client as
 *  payload.docsKey so the stream can re-attach phase-1 snippets (#707). */
export function docsCacheRefs(
  query: string,
  req: NextApiRequest,
): { docsHash: string; docsCacheKey: string } {
  const docsHash = hashDocsKey(query, {
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    tier: req.query.tier as string | undefined,
    eras: req.query.eras as string | undefined,
  });
  return { docsHash, docsCacheKey: CacheKeys.searchResearchDocs(docsHash) };
}

/**
 * Serve the cached docsOnly response if present (#705: the stratified
 * retrieval + fusion measured 30-50s on prod — a repeat visitor or a
 * pre-warmed outreach URL should see documents in under a second).
 * refresh=true bypasses the read (still writes): the Monday pre-warm uses it
 * to rebuild caches right after new data lands. Returns true when served —
 * and records the behavior row (#727): cache serves carry no timings but ARE
 * usage, the frequency signal the build-only log was blind to.
 */
export async function serveCachedDocs(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
  queryHash: string,
  docsCacheKey: string,
): Promise<boolean> {
  if (req.query.refresh === 'true') return false;
  const cachedDocs = await cacheGet<Record<string, unknown>>(docsCacheKey);
  if (!cachedDocs) return false;
  res.status(200).json(cachedDocs);
  void recordSearchTiming({ ...timingRecord(req, query, queryHash), served: 'cache' });
  return true;
}

/** Zero-result response + unmet-demand row (#727): a search that found
 *  nothing is the strongest new-document-source signal. */
export function respondEmpty(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
  queryHash: string,
  docsOnly: boolean,
  embedMs: number,
  retrievalTimings: RetrievalTimings,
): void {
  void recordSearchTiming({
    ...timingRecord(req, query, queryHash, embedMs, retrievalTimings),
    served: 'empty',
    docCount: 0,
  });
  res.status(200).json(emptyResearchResponse(docsOnly));
}

/** The exact search shape (+ phase timings when retrieval ran) for the
 *  degradation/behavior log (#727). Callers override `served`/`docCount`. */
function timingRecord(
  req: NextApiRequest,
  query: string,
  queryHash: string,
  embedMs?: number,
  retrievalTimings?: RetrievalTimings,
) {
  return {
    query,
    queryHash,
    params: {
      mode: 'research',
      tier: (req.query.tier as string) ?? null,
      eras: (req.query.eras as string) ?? null,
      dateFrom: (req.query.dateFrom as string) ?? null,
      dateTo: (req.query.dateTo as string) ?? null,
      refresh: req.query.refresh === 'true',
      debug: req.query.debug === '1',
    },
    served: 'build' as const,
    ...(embedMs != null ? { embedMs } : {}),
    ...(retrievalTimings ?? {}),
  };
}

/** docsOnly BUILD response: payload with build timings (#726), the
 *  degradation/behavior row (#727), and the cache-or-trace respond. */
export async function respondDocsOnlyBuild(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
  build: {
    queryHash: string;
    debug: boolean;
    docsCacheKey: string;
    docsHash: string;
    embedMs: number;
    avgSimilarity: number;
    retrieval: RetrievalResult;
  },
): Promise<void> {
  const { retrieval } = build;
  const payload = {
    ...buildDocsOnlyPayload(
      retrieval.docs,
      build.avgSimilarity,
      retrieval.strata,
      retrieval.inferredFrom,
      retrieval.alsoSearched,
      build.docsHash,
    ),
    // Phase breakdown of THIS build (#726) — rides into the docsOnly cache,
    // so a later fetch of the cached payload reads what the build cost.
    timings: {
      embedMs: build.embedMs,
      ...retrieval.timings,
      measuredAt: new Date().toISOString(),
    },
  };
  // Degradation capture (#727): fire-and-forget — never delays the response.
  void recordSearchTiming({
    ...timingRecord(req, query, build.queryHash, build.embedMs, retrieval.timings),
    docCount: retrieval.docs.length,
  });
  await respondDocsOnly(
    req,
    res,
    query,
    payload,
    build.docsCacheKey,
    build.debug,
    retrieval.candidates,
  );
}

/** docsOnly response: debug runs attach the trace and skip the cache. */
async function respondDocsOnly(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
  payload: Record<string, unknown>,
  docsCacheKey: string,
  debug: boolean,
  candidates: CandidateSummary[] | undefined,
): Promise<void> {
  if (debug) {
    const strata = payload.strata as Array<{ key: string; from?: string; to?: string }> | undefined;
    res
      .status(200)
      .json({ ...payload, trace: await buildDebugTrace(req, query, candidates, strata) });
    return;
  }
  await cacheSet(docsCacheKey, payload, RESEARCH_DOCS_CACHE_TTL);
  res.status(200).json(payload);
}
