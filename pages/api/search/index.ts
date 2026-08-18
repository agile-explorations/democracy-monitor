import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { embedQueryCached } from '@/lib/services/embedding-service';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import { RESEARCH_CONTEXT_DOCS, retrieveResearchDocs } from '@/lib/services/research-doc-retrieval';
import { synthesizeResearchAnswer } from '@/lib/services/research-synthesis-service';
import {
  claimBuildSlot,
  claimGlobalBuildSlot,
  docsCacheRefs,
  hashQuery,
  releaseBuildSlot,
  releaseGlobalBuildSlot,
  respondBuilding,
  respondDocsOnlyBuild,
  respondEmpty,
  serveCachedDocs,
} from '@/lib/services/search-docs-response';
import type { CorpusStats } from '@/lib/services/search-research-queries';
import { searchCorpusStats } from '@/lib/services/search-research-queries';
import type { CachedResearchResult } from '@/lib/services/search-response-format';
import { formatResearchResponse } from '@/lib/services/search-response-format';
import type { ResearchDocument } from '@/lib/services/search-service';
import { searchExplore } from '@/lib/services/search-service';
import { recordSearchTiming } from '@/lib/services/search-timing-log';
import { enrichDocsForSynthesis } from '@/lib/services/synthesis-context-enrichment';
import { formatError, parseBooleanParam, requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

const RESEARCH_CACHE_TTL = 86400; // 24 hours

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!(await enforceRateLimit(req, res, RATE_LIMITS.search))) return;
  if (!requireDb(res)) return;

  const query = (req.query.q as string)?.trim();
  if (!query) {
    res.status(400).json({ error: 'Missing required query parameter: q' });
    return;
  }

  const mode = (req.query.mode as string) ?? 'research';

  try {
    if (mode === 'research') {
      await handleResearch(req, res, query);
    } else if (mode === 'explore') {
      await handleExplore(req, res, query);
    } else {
      res.status(400).json({ error: 'Invalid mode. Use "research" or "explore".' });
    }
  } catch (err) {
    console.error(`[api/search] ${mode} failed:`, err);
    res.status(500).json({ error: formatError(err) });
  }
}

/**
 * Embed the query with timing; on failure respond 503 and return null. An
 * embedding failure means retrieval never ran — surfaced as an outage, not an
 * empty result set (#598 errors-not-empty); provider blips are transient so
 * retrying almost always succeeds.
 */
async function timedEmbedOrFail(
  res: NextApiResponse,
  query: string,
  queryHash: string,
): Promise<{ embedding: number[]; embedMs: number } | null> {
  const embedStart = Date.now();
  const embedding = await embedQueryCached(query);
  const embedMs = Date.now() - embedStart;
  if (!embedding) {
    console.error(`[api/search] embed failed q=${queryHash} after ${embedMs}ms`);
    res
      .status(503)
      .json({ error: 'Search is temporarily unavailable. Please try the search again.' });
    return null;
  }
  console.log(`[api/search] timings q=${queryHash} embed=${embedMs}ms`);
  return { embedding, embedMs };
}

/** adaptiveCorpusStats with the phase-timing log line attached. */
async function timedCorpusStats(
  embedding: number[],
  docs: ResearchDocument[],
  queryHash: string,
): Promise<CorpusStats | null> {
  const statsStart = Date.now();
  const corpusStats = await adaptiveCorpusStats(embedding, docs);
  console.log(`[api/search] timings q=${queryHash} stats=${Date.now() - statsStart}ms`);
  return corpusStats;
}

/** Compute adaptive corpus stats using the least-similar retrieved doc as threshold. */
async function adaptiveCorpusStats(
  embedding: number[],
  docs: ResearchDocument[],
): Promise<CorpusStats | null> {
  if (docs.length === 0) return null;
  const leastSimilarity = Math.min(...docs.map((d) => d.cosineSimilarity));
  return leastSimilarity > 0 ? searchCorpusStats(embedding, 1 - leastSimilarity) : null;
}

export type { RetrievalStratum } from '@/lib/services/search-response-types';

/** Parse + validate the research boolean flags (#732): unrecognized values
 *  400 instead of silently taking the wrong code path (docsOnly=1 used to
 *  fall through to the full synthesis pipeline). Canonicalizes the spellings
 *  downstream helpers compare against. debug (#718) is the always-fresh
 *  diagnostic run — it bypasses the docs cache in both directions. */
function parseResearchFlags(
  req: NextApiRequest,
  res: NextApiResponse,
): { editorial: boolean; docsOnly: boolean; debug: boolean } | null {
  const editorial = parseBooleanParam(req.query.editorial);
  const docsOnly = parseBooleanParam(req.query.docsOnly);
  const debug = parseBooleanParam(req.query.debug);
  const refresh = parseBooleanParam(req.query.refresh);
  if (editorial === null || docsOnly === null || debug === null || refresh === null) {
    res.status(400).json({
      error:
        'Boolean parameters (docsOnly, debug, refresh, editorial) accept true/false/1/0/yes/no',
    });
    return null;
  }
  req.query.refresh = refresh ? 'true' : 'false';
  req.query.debug = debug ? '1' : '0';
  return { editorial, docsOnly, debug };
}

async function handleResearch(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
): Promise<void> {
  const flags = parseResearchFlags(req, res);
  if (!flags) return;
  const { editorial, docsOnly, debug } = flags;
  const queryHash = hashQuery(query);

  const { docsHash, docsCacheKey } = docsCacheRefs(query, req);
  // Cached serve also records the behavior row (#727): cache hits carry no
  // timings but ARE usage — the frequency signal the build-only log missed.
  if (docsOnly && !debug && (await serveCachedDocs(req, res, query, queryHash, docsCacheKey))) {
    return;
  }

  // Build coalescing (#729): retries after an edge cut (and concurrent
  // identical searches) wait-poll instead of starting a duplicate build.
  const coalesce = docsOnly && !debug;
  if (coalesce && !(await claimBuildSlot(docsHash))) {
    respondBuilding(res);
    return;
  }
  // Global semaphore (#729 DOS hardening): distinct novel builds queue past
  // a server-wide concurrency cap. The hash slot is released first so the
  // retry can claim both when capacity frees.
  let globalSlot: number | null = null;
  if (coalesce) {
    globalSlot = await claimGlobalBuildSlot();
    if (globalSlot === null) {
      releaseBuildSlot(docsHash);
      respondBuilding(res);
      return;
    }
  }
  try {
    await runResearchBuild(req, res, query, {
      queryHash,
      editorial,
      docsOnly,
      debug,
      docsHash,
      docsCacheKey,
    });
  } finally {
    if (coalesce) {
      releaseBuildSlot(docsHash);
      if (globalSlot !== null) releaseGlobalBuildSlot(globalSlot);
    }
  }
}

/** The uncached research build: embed → retrieve → respond (docsOnly or
 *  full synthesis). Runs inside the coalescing slot. */
async function runResearchBuild(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
  ctx: {
    queryHash: string;
    editorial: boolean;
    docsOnly: boolean;
    debug: boolean;
    docsHash: string;
    docsCacheKey: string;
  },
): Promise<void> {
  const { queryHash, editorial, docsOnly, debug, docsHash, docsCacheKey } = ctx;
  const embedResult = await timedEmbedOrFail(res, query, queryHash);
  if (!embedResult) return;
  const { embedding, embedMs } = embedResult;

  const retrieveStart = Date.now();
  const retrieval = await retrieveResearchDocs(req, query, embedding, debug);
  const allDocs = retrieval.docs;
  // Phase-timing line for cold-cache diagnosis (post-dump HNSW evictions can
  // multiply retrieval time; CF cuts requests at ~100s since 2026-07-31).
  console.log(
    `[api/search] timings q=${queryHash} retrieve=${Date.now() - retrieveStart}ms docs=${allDocs.length} docsOnly=${docsOnly}`,
  );
  if (allDocs.length === 0) {
    respondEmpty(req, res, query, queryHash, docsOnly, embedMs, retrieval.timings);
    return;
  }

  const avgSimilarity = avgCosineSimilarity(allDocs);

  // docsOnly: return documents immediately without expensive corpus stats
  // (corpus stats scan 164K embeddings — ~15-20s). Stats are computed
  // in the streaming synthesis phase instead.
  if (docsOnly) {
    await respondDocsOnlyBuild(req, res, query, {
      queryHash,
      debug,
      docsCacheKey,
      docsHash,
      embedMs,
      avgSimilarity,
      retrieval,
    });
    return;
  }

  const corpusStats = await timedCorpusStats(embedding, allDocs, queryHash);

  await synthesizeAndRespond(res, query, queryHash, allDocs, {
    editorial,
    alsoSearched: retrieval.alsoSearched,
    avgSimilarity,
    corpusStats,
  });
}

/** Cache-checked synthesis: serve the cached answer or generate, cache, respond. */
async function synthesizeAndRespond(
  res: NextApiResponse,
  query: string,
  queryHash: string,
  allDocs: ResearchDocument[],
  opts: {
    editorial: boolean;
    alsoSearched: ValidatedAlias[];
    avgSimilarity: number;
    corpusStats: CorpusStats | null;
  },
): Promise<void> {
  const cached = await cacheGet<CachedResearchResult>(CacheKeys.searchResearch(queryHash));
  if (cached) {
    res
      .status(200)
      .json(formatResearchResponse(cached, allDocs, opts.editorial, opts.alsoSearched));
    return;
  }

  const contextDocs = allDocs.slice(0, RESEARCH_CONTEXT_DOCS);
  await enrichDocsForSynthesis(contextDocs, query);
  const synthesis = await synthesizeResearchAnswer(
    query,
    contextDocs,
    opts.corpusStats,
    opts.alsoSearched,
  );
  const result: CachedResearchResult = {
    synthesis,
    documents: allDocs,
    queryConfidence: opts.avgSimilarity,
    corpusStats: opts.corpusStats,
  };

  await cacheSet(CacheKeys.searchResearch(queryHash), result, RESEARCH_CACHE_TTL);
  res.status(200).json(formatResearchResponse(result, allDocs, opts.editorial, opts.alsoSearched));
}

async function handleExplore(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
): Promise<void> {
  const started = Date.now();
  const result = await searchExplore({
    query,
    category: req.query.category as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    sourceOrigin: req.query.source as string | undefined,
    scoreMin: req.query.scoreMin ? Number(req.query.scoreMin) : undefined,
    scoreMax: req.query.scoreMax ? Number(req.query.scoreMax) : undefined,
    documentClass: req.query.class as string | undefined,
    sort: (req.query.sort as 'relevance' | 'date' | 'score') ?? 'relevance',
    page: req.query.page ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
  });

  // Behavior + degradation row (#727/#728): Explore was blind to the timing
  // log; totalMs alone still trips the 30s degradation threshold.
  void recordSearchTiming({
    query,
    queryHash: hashQuery(query),
    params: {
      mode: 'explore',
      category: (req.query.category as string) ?? null,
      source: (req.query.source as string) ?? null,
      sort: (req.query.sort as string) ?? null,
      dateFrom: (req.query.dateFrom as string) ?? null,
      dateTo: (req.query.dateTo as string) ?? null,
      page: (req.query.page as string) ?? null,
    },
    served: result.totalResults === 0 ? 'empty' : 'build',
    docCount: result.totalResults,
    totalMs: Date.now() - started,
  });

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(result);
}

function avgCosineSimilarity(docs: ResearchDocument[]): number {
  return docs.length > 0 ? docs.reduce((sum, d) => sum + d.cosineSimilarity, 0) / docs.length : 0;
}
