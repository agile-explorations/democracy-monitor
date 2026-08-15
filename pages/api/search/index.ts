import { createHash } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { embedText } from '@/lib/services/embedding-service';
import { expandDiagnostic } from '@/lib/services/query-expansion-service';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import { RESEARCH_CONTEXT_DOCS, retrieveResearchDocs } from '@/lib/services/research-doc-retrieval';
import type { CandidateSummary } from '@/lib/services/research-doc-retrieval';
import { computeDateRange } from '@/lib/services/research-prompts';
import { synthesizeResearchAnswer } from '@/lib/services/research-synthesis-service';
import type { CorpusStats } from '@/lib/services/search-research-queries';
import { searchCorpusStats } from '@/lib/services/search-research-queries';
import type { CachedResearchResult } from '@/lib/services/search-response-format';
import {
  buildDocsOnlyPayload,
  emptyResearchResponse,
  formatResearchResponse,
  hashDocsKey,
} from '@/lib/services/search-response-format';
import type { RetrievalStratum } from '@/lib/services/search-response-types';
import type { ResearchDocument, ResearchTierFilter } from '@/lib/services/search-service';
import { searchExplore, searchResearch } from '@/lib/services/search-service';
import { enrichDocsForSynthesis } from '@/lib/services/synthesis-context-enrichment';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

const RESEARCH_CACHE_TTL = 86400; // 24 hours
/** docsOnly doc lists change only when data does (Monday snapshot); the
 *  pre-warm workflow refreshes them right after (&refresh=true). */
const RESEARCH_DOCS_CACHE_TTL = 7 * 86400;

function hashQuery(q: string): string {
  return createHash('sha256').update(q.toLowerCase().trim()).digest('hex').slice(0, 16);
}

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
): Promise<number[] | null> {
  const embedStart = Date.now();
  const embedding = await embedText(query);
  const embedMs = Date.now() - embedStart;
  if (!embedding) {
    console.error(`[api/search] embed failed q=${queryHash} after ${embedMs}ms`);
    res
      .status(503)
      .json({ error: 'Search is temporarily unavailable. Please try the search again.' });
    return null;
  }
  console.log(`[api/search] timings q=${queryHash} embed=${embedMs}ms`);
  return embedding;
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

/** docsOnly cache refs: the bare hash also travels to the client as
 *  payload.docsKey so the stream can re-attach phase-1 snippets (#707). */
function docsCacheRefs(
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
 * to rebuild caches right after new data lands. Returns true when served.
 */
async function serveCachedDocs(
  res: NextApiResponse,
  req: NextApiRequest,
  docsCacheKey: string,
): Promise<boolean> {
  if (req.query.refresh === 'true') return false;
  const cachedDocs = await cacheGet<Record<string, unknown>>(docsCacheKey);
  if (!cachedDocs) return false;
  res.status(200).json(cachedDocs);
  return true;
}

/** Assemble the #718 debug trace: settings, expansion diagnostics with
 *  rejected reasons, and the pre-rerank candidate set. Comparative searches
 *  validate aliases PER ERA WINDOW, so the diagnostics run per window too —
 *  a single windowless diagnostic showed terms as "rejected" whose windowed
 *  arms actually ran (#721). */
async function buildDebugTrace(
  req: NextApiRequest,
  query: string,
  candidates: CandidateSummary[] | undefined,
  strata: Array<{ key: string; from?: string; to?: string }> | undefined,
) {
  const tier = (req.query.tier as string | undefined) ?? 'all';
  const windows = strata?.length
    ? strata.map((s) => ({ key: s.key, dateFrom: s.from, dateTo: s.to }))
    : [
        {
          key: 'request',
          dateFrom: req.query.dateFrom as string | undefined,
          dateTo: req.query.dateTo as string | undefined,
        },
      ];
  const expansion = await Promise.all(
    windows.map(async (w) => ({
      window: { key: w.key, from: w.dateFrom ?? null, to: w.dateTo ?? null },
      ...(await expandDiagnostic(query, {
        dateFrom: w.dateFrom,
        dateTo: w.dateTo,
        tier: tier === 'all' ? undefined : (tier as 'action' | 'discussion'),
      })),
    })),
  );
  return {
    capturedAt: new Date().toISOString(),
    settings: {
      tier,
      dateFrom: req.query.dateFrom ?? null,
      dateTo: req.query.dateTo ?? null,
      eras: req.query.eras ?? null,
    },
    expansion,
    candidatesPreRerank: candidates ?? [],
  };
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

async function handleResearch(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
): Promise<void> {
  const editorial = req.query.editorial === 'true';
  const docsOnly = req.query.docsOnly === 'true';
  // Debug trace (#718): always-fresh diagnostic run — bypasses the docs
  // cache in both directions so the trace reflects live behavior.
  const debug = req.query.debug === '1';
  const queryHash = hashQuery(query);

  const { docsHash, docsCacheKey } = docsCacheRefs(query, req);
  if (docsOnly && !debug && (await serveCachedDocs(res, req, docsCacheKey))) return;

  const embedding = await timedEmbedOrFail(res, query, queryHash);
  if (!embedding) return;

  const retrieveStart = Date.now();
  const {
    docs: allDocs,
    strata,
    inferredFrom,
    alsoSearched,
    candidates,
  } = await retrieveResearchDocs(req, query, embedding, debug);
  // Phase-timing line for cold-cache diagnosis (post-dump HNSW evictions can
  // multiply retrieval time; CF cuts requests at ~100s since 2026-07-31).
  console.log(
    `[api/search] timings q=${queryHash} retrieve=${Date.now() - retrieveStart}ms docs=${allDocs.length} docsOnly=${docsOnly}`,
  );
  if (allDocs.length === 0) {
    res.status(200).json(emptyResearchResponse(docsOnly));
    return;
  }

  const dateRange = computeDateRange(allDocs);
  const avgSimilarity = avgCosineSimilarity(allDocs);

  // docsOnly: return documents immediately without expensive corpus stats
  // (corpus stats scan 164K embeddings — ~15-20s). Stats are computed
  // in the streaming synthesis phase instead.
  if (docsOnly) {
    const payload = buildDocsOnlyPayload(
      allDocs,
      avgSimilarity,
      strata,
      inferredFrom,
      alsoSearched,
      docsHash,
    );
    await respondDocsOnly(req, res, query, payload, docsCacheKey, debug, candidates);
    return;
  }

  const corpusStats = await timedCorpusStats(embedding, allDocs, queryHash);

  await synthesizeAndRespond(res, query, queryHash, allDocs, {
    editorial,
    alsoSearched,
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

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(result);
}

function avgCosineSimilarity(docs: ResearchDocument[]): number {
  return docs.length > 0 ? docs.reduce((sum, d) => sum + d.cosineSimilarity, 0) / docs.length : 0;
}
