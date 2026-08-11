import { createHash } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { embedText } from '@/lib/services/embedding-service';
import type { EraWindow } from '@/lib/services/era-extraction';
import {
  ERA_WINDOWS,
  extractComparisonEras,
  extractDateFloor,
} from '@/lib/services/era-extraction';
import { expandAndValidate } from '@/lib/services/query-expansion-service';
import { rerankByRelevance } from '@/lib/services/relevance-rerank';
import { computeDateRange } from '@/lib/services/research-prompts';
import { synthesizeResearchAnswer } from '@/lib/services/research-synthesis-service';
import type { CorpusStats } from '@/lib/services/search-research-queries';
import { searchCorpusStats } from '@/lib/services/search-research-queries';
import type { CachedResearchResult } from '@/lib/services/search-response-format';
import {
  emptyResearchResponse,
  formatDocList,
  formatResearchResponse,
} from '@/lib/services/search-response-format';
import type { ResearchDocument, ResearchTierFilter } from '@/lib/services/search-service';
import { searchExplore, searchResearch } from '@/lib/services/search-service';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

const RESEARCH_CACHE_TTL = 86400; // 24 hours
const RESEARCH_CONTEXT_DOCS = 30; // docs sent to LLM

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

/** Compute adaptive corpus stats using the least-similar retrieved doc as threshold. */
async function adaptiveCorpusStats(
  embedding: number[],
  docs: ResearchDocument[],
): Promise<CorpusStats | null> {
  if (docs.length === 0) return null;
  const leastSimilarity = Math.min(...docs.map((d) => d.cosineSimilarity));
  return leastSimilarity > 0 ? searchCorpusStats(embedding, 1 - leastSimilarity) : null;
}

export interface RetrievalStratum {
  key: string;
  label: string;
  from: string;
  to?: string;
  docCount: number;
  /** True when the user's date range excludes this era entirely; the era
   *  window itself was searched and the conflict surfaced, not hidden. */
  dateConflict?: boolean;
}

/** Intersect user date bounds with each era window; an empty intersection
 *  falls back to the full era and is flagged rather than silently dropped. */
function intersectEraWindows(eras: EraWindow[], dateFrom?: string, dateTo?: string) {
  return eras.map((era) => {
    const from = dateFrom && dateFrom > era.from ? dateFrom : era.from;
    const to = dateTo && (!era.to || dateTo < era.to) ? dateTo : era.to;
    const dateConflict = Boolean(to && from > to);
    return dateConflict
      ? { era, from: era.from, to: era.to, dateConflict }
      : { era, from, to, dateConflict };
  });
}

/**
 * Run the tiered research retrieval with the request's date + tier params
 * (#552). Comparative questions stratify the context slots across the
 * administrations the question names (#592): each era competes only with
 * itself, so the recency-dense current term cannot crowd out the eras being
 * compared. User date bounds intersect each era window; an intersection that
 * would be empty falls back to the full era window and is flagged.
 */
/** Corpus-validated alias phrases for the windows searched (#702) — cache
 *  hits, since searchResearch already ran the same expansion internally. */
async function collectAlsoSearched(
  query: string,
  windows: Array<{ from?: string; to?: string }>,
  tier: ResearchTierFilter,
): Promise<string[]> {
  const phrases = new Set<string>();
  for (const w of windows) {
    const aliases = await expandAndValidate(query, {
      dateFrom: w.from,
      dateTo: w.to,
      tier: tier === 'all' ? undefined : tier,
    });
    for (const a of aliases) phrases.add(a.phrase);
  }
  return [...phrases];
}

async function retrieveResearchDocs(req: NextApiRequest, query: string, embedding: number[]) {
  // Range phrases in the question ("since January 2025") become a date floor
  // when the user has not set explicit dates; surfaced in the response so
  // the page can show what was inferred.
  const inferredFrom = !req.query.dateFrom ? extractDateFloor(query) : null;
  const dateFrom = (req.query.dateFrom as string | undefined) ?? inferredFrom ?? undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const tier = (req.query.tier as ResearchTierFilter | undefined) ?? 'all';

  // Chips UI override (#592): eras=trump_t1,trump_t2 pins the strata after
  // the user removes one; a single remaining era degrades to a plain
  // date-windowed retrieval.
  const eraParam = req.query.eras as string | undefined;
  const requested = eraParam
    ? eraParam
        .split(',')
        .map((k) => ERA_WINDOWS[k as keyof typeof ERA_WINDOWS])
        .filter(Boolean)
    : null;
  const eras = requested && requested.length > 0 ? requested : extractComparisonEras(query);
  if (!eras || eras.length < 2) {
    const w = eras?.[0];
    const candidates = await searchResearch(
      query,
      RESEARCH_CONTEXT_DOCS * 2,
      embedding,
      w ? w.from : dateFrom,
      w ? w.to : dateTo,
      tier,
    );
    const docs = await rerankByRelevance(query, candidates, RESEARCH_CONTEXT_DOCS);
    const alsoSearched = await collectAlsoSearched(
      query,
      [w ? { from: w.from, to: w.to } : { from: dateFrom, to: dateTo }],
      tier,
    );
    return { docs, strata: null, inferredFrom, alsoSearched };
  }

  const slots = Math.floor(RESEARCH_CONTEXT_DOCS / eras.length);
  const windows = intersectEraWindows(eras, dateFrom, dateTo);
  const perEra = await Promise.all(
    windows.map(async (w) => {
      const candidates = await searchResearch(query, slots * 2, embedding, w.from, w.to, tier);
      return rerankByRelevance(query, candidates, slots);
    }),
  );
  const strata: RetrievalStratum[] = windows.map((w, i) => ({
    key: w.era.key,
    label: w.era.label,
    from: w.from,
    to: w.to,
    docCount: perEra[i].length,
    ...(w.dateConflict ? { dateConflict: true } : {}),
  }));
  const alsoSearched = await collectAlsoSearched(query, windows, tier);
  return { docs: perEra.flat(), strata, inferredFrom, alsoSearched };
}

async function handleResearch(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
): Promise<void> {
  const editorial = req.query.editorial === 'true';
  const docsOnly = req.query.docsOnly === 'true';
  const queryHash = hashQuery(query);

  const embedding = await timedEmbedOrFail(res, query, queryHash);
  if (!embedding) return;

  const retrieveStart = Date.now();
  const {
    docs: allDocs,
    strata,
    inferredFrom,
    alsoSearched,
  } = await retrieveResearchDocs(req, query, embedding);
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
    res.status(200).json({
      documents: formatDocList(allDocs),
      dateRange,
      queryConfidence: avgSimilarity,
      ...(strata ? { strata } : {}),
      ...(inferredFrom ? { inferredDateFrom: inferredFrom } : {}),
      ...(alsoSearched.length > 0 ? { alsoSearched } : {}),
    });
    return;
  }

  const statsStart = Date.now();
  const corpusStats = await adaptiveCorpusStats(embedding, allDocs);
  console.log(`[api/search] timings q=${queryHash} stats=${Date.now() - statsStart}ms`);

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
    alsoSearched: string[];
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
  const synthesis = await synthesizeResearchAnswer(query, contextDocs, opts.corpusStats);
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
