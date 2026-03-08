import { createHash } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { computeDateRange } from '@/lib/services/research-prompts';
import type { ResearchSynthesisResult } from '@/lib/services/research-synthesis-service';
import { synthesizeResearchAnswer } from '@/lib/services/research-synthesis-service';
import type { ResearchDocument } from '@/lib/services/search-service';
import { searchExplore, searchResearch } from '@/lib/services/search-service';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';

const RESEARCH_CACHE_TTL = 86400; // 24 hours
const RESEARCH_CONTEXT_DOCS = 20; // docs sent to LLM

interface CachedResearchResult {
  synthesis: ResearchSynthesisResult;
  documents: ResearchDocument[];
  queryConfidence: number;
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

async function handleResearch(
  req: NextApiRequest,
  res: NextApiResponse,
  query: string,
): Promise<void> {
  const editorial = req.query.editorial === 'true';
  const docsOnly = req.query.docsOnly === 'true';
  const queryHash = hashQuery(query);

  // Retrieve documents (needed for both docsOnly and full)
  const allDocs = await searchResearch(query, 20);
  const dateRange = computeDateRange(allDocs);
  const avgSimilarity =
    allDocs.length > 0
      ? allDocs.reduce((sum, d) => sum + d.cosineSimilarity, 0) / allDocs.length
      : 0;

  if (allDocs.length === 0) {
    res.status(200).json({
      documents: [],
      dateRange: { earliest: 'unknown', latest: 'unknown' },
      queryConfidence: 0,
      ...(docsOnly ? {} : { answer: emptyAnswer(), relatedQuestions: [] }),
    });
    return;
  }

  // Fast path: return just documents for immediate display
  if (docsOnly) {
    res.status(200).json({
      documents: formatDocList(allDocs),
      dateRange,
      queryConfidence: avgSimilarity,
    });
    return;
  }

  // Check cache for full synthesis
  const cached = await cacheGet<CachedResearchResult>(CacheKeys.searchResearch(queryHash));
  if (cached) {
    res.status(200).json(formatResearchResponse(cached, allDocs, editorial));
    return;
  }

  // Send top N to synthesis
  const contextDocs = allDocs.slice(0, RESEARCH_CONTEXT_DOCS);
  const synthesis = await synthesizeResearchAnswer(query, contextDocs);

  const result: CachedResearchResult = {
    synthesis,
    documents: allDocs,
    queryConfidence: avgSimilarity,
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
  }));
}

function formatResearchResponse(
  result: CachedResearchResult,
  allDocs: ResearchDocument[],
  editorial: boolean,
) {
  const { synthesis, queryConfidence } = result;
  const dateRange = computeDateRange(allDocs);

  const response: Record<string, unknown> = {
    answer: { expert: synthesis.expert, public: synthesis.public },
    documents: formatDocList(allDocs),
    dateRange,
    queryConfidence,
    relatedQuestions: synthesis.relatedQuestions,
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
