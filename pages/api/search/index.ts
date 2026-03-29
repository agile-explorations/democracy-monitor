import { createHash } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { embedText } from '@/lib/services/embedding-service';
import { computeDateRange } from '@/lib/services/research-prompts';
import type { ResearchSynthesisResult } from '@/lib/services/research-synthesis-service';
import { synthesizeResearchAnswer } from '@/lib/services/research-synthesis-service';
import type { CorpusStats } from '@/lib/services/search-research-queries';
import { searchCorpusStats } from '@/lib/services/search-research-queries';
import type { ResearchDocument } from '@/lib/services/search-service';
import { searchExplore, searchResearch } from '@/lib/services/search-service';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';

const RESEARCH_CACHE_TTL = 86400; // 24 hours
const RESEARCH_CONTEXT_DOCS = 20; // docs sent to LLM

interface CachedResearchResult {
  synthesis: ResearchSynthesisResult;
  documents: ResearchDocument[];
  queryConfidence: number;
  corpusStats?: CorpusStats | null;
}

function hashQuery(q: string): string {
  return createHash('sha256').update(q.toLowerCase().trim()).digest('hex').slice(0, 16);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
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

function emptyResearchResponse(docsOnly: boolean) {
  return {
    documents: [],
    dateRange: { earliest: 'unknown', latest: 'unknown' },
    queryConfidence: 0,
    ...(docsOnly ? {} : { answer: emptyAnswer(), relatedQuestions: [] }),
  };
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

async function handleResearch(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
): Promise<void> {
  const editorial = req.query.editorial === 'true';
  const docsOnly = req.query.docsOnly === 'true';
  const queryHash = hashQuery(query);

  const embedding = await embedText(query);
  if (!embedding) {
    res.status(200).json(emptyResearchResponse(docsOnly));
    return;
  }

  const allDocs = await searchResearch(query, 20, embedding);
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
    });
    return;
  }

  const corpusStats = await adaptiveCorpusStats(embedding, allDocs);

  const cached = await cacheGet<CachedResearchResult>(CacheKeys.searchResearch(queryHash));
  if (cached) {
    res.status(200).json(formatResearchResponse(cached, allDocs, editorial));
    return;
  }

  const contextDocs = allDocs.slice(0, RESEARCH_CONTEXT_DOCS);
  const synthesis = await synthesizeResearchAnswer(query, contextDocs, corpusStats);
  const result: CachedResearchResult = {
    synthesis,
    documents: allDocs,
    queryConfidence: avgSimilarity,
    corpusStats,
  };

  await cacheSet(CacheKeys.searchResearch(queryHash), result, RESEARCH_CACHE_TTL);
  res.status(200).json(formatResearchResponse(result, allDocs, editorial));
}

function emptyAnswer() {
  return {
    expert:
      'The documentary record in our corpus does not contain enough information to answer this question. ' +
      'This may mean the topic is not reflected in Federal Register publications, court filings, or other ' +
      'government documents in our collection, or that relevant documents fall outside our current date range.',
    public:
      'We could not find enough government documents to answer this question. The topic may not be covered ' +
      'in the documents we monitor, or relevant documents may fall outside the dates we have on record.',
  };
}

function formatDocList(docs: ResearchDocument[]) {
  return docs.map((doc, i) => ({
    citationIndex: i + 1,
    id: doc.id,
    title: doc.title,
    url: doc.url,
    publishedAt: doc.publishedAt,
    sourceType: doc.sourceType,
    sourceOrigin: doc.sourceOrigin,
    category: doc.category,
    cosineSimilarity: doc.cosineSimilarity,
    finalScore: doc.finalScore,
    documentClass: doc.documentClass,
    p2Assessment: doc.p2Assessment,
    p2ErosionType: doc.p2ErosionType,
  }));
}

function formatResearchResponse(
  result: CachedResearchResult,
  allDocs: ResearchDocument[],
  editorial: boolean,
) {
  const { synthesis, queryConfidence, corpusStats: stats } = result;
  const dateRange = computeDateRange(allDocs);

  const response: Record<string, unknown> = {
    answer: { expert: synthesis.expert, public: synthesis.public },
    documents: formatDocList(allDocs),
    dateRange,
    queryConfidence,
    relatedQuestions: synthesis.relatedQuestions,
    ...(stats ? { corpusStats: stats } : {}),
  };

  if (editorial) {
    response.editorial = {
      expertDraft: synthesis.expertDraft,
      publicDraft: synthesis.publicDraft,
      feedback: synthesis.feedback,
      draftModel: synthesis.draftModel,
      feedbackModel: synthesis.feedbackModel,
      finalModel: synthesis.finalModel,
    };
  }

  return response;
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

  res.status(200).json(result);
}

function avgCosineSimilarity(docs: ResearchDocument[]): number {
  return docs.length > 0 ? docs.reduce((sum, d) => sum + d.cosineSimilarity, 0) / docs.length : 0;
}
