/**
 * SSE streaming endpoint for single-pass research synthesis.
 *
 * GET /api/search/stream?q=...
 *
 * Events:
 *   data: {"type":"chunk","text":"..."} — incremental LLM output
 *   data: {"type":"verification","totalQuotes":N,"verifiedCount":N,"unverified":[...]} — quote check (#707)
 *   data: {"type":"done","model":"...","latencyMs":N,"tokensUsed":{...}} — completion metadata
 *   data: {"type":"error","message":"..."} — error
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { AnthropicProvider } from '@/lib/ai/anthropic';
import { cacheGet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { embedQueryCached } from '@/lib/services/embedding-service';
import type { SynthesisBudget } from '@/lib/services/question-classifier';
import { budgetForQuestion } from '@/lib/services/question-classifier';
import { verifyAnswerQuotes } from '@/lib/services/quote-verification';
import { buildSinglePassPrompt } from '@/lib/services/research-prompts';
import type { ResearchDocument, ResearchTierFilter } from '@/lib/services/search-service';
import { fetchResearchDocsByIds, searchResearchWithMeta } from '@/lib/services/search-service';
import { enrichDocsForSynthesis } from '@/lib/services/synthesis-context-enrichment';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

const SINGLE_PASS_MODEL = 'claude-sonnet-4-6';
const SYNTHESIS_TEMPERATURE = 0.2;
// Doc + output budgets come from the question classifier (#751): both
// endpoints classify the same text, so a 60-doc enumeration payload is
// never silently cut back to 30 here.

const SYSTEM_SINGLE_PASS =
  'You are a research analyst answering questions about U.S. government actions. ' +
  'Your answers are grounded exclusively in the provided government documents. ' +
  'Apply the self-verification checklist before finalizing your answer.';

export const config = { api: { responseLimit: false } };

function sendEvent(res: NextApiResponse, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseIdsParam(idsParam?: string): number[] | undefined {
  if (!idsParam) return undefined;
  return idsParam
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * Re-attach phase-1 matched-passage snippets (#707 audit): the id-refetch
 * loses them, and without them the synthesis denies content its own doc
 * cards display. The client passes the docsOnly cache key (dk); a miss
 * degrades silently to no snippets.
 */
async function attachCachedSnippets(
  docs: ResearchDocument[],
  docsKey?: string,
): Promise<Array<{ phrase: string; matches: number }> | undefined> {
  if (!docsKey || !/^[a-f0-9]{16}$/.test(docsKey)) return undefined;
  const cached = await cacheGet<{
    documents?: Array<Record<string, unknown>>;
    alsoSearched?: string[];
    searchedTerms?: Array<{ phrase: string; matches: number }>;
  }>(CacheKeys.searchResearchDocs(docsKey));
  if (!cached?.documents) return undefined;
  const byId = new Map(cached.documents.map((d) => [Number(d.id), d]));
  for (const doc of docs) {
    const meta = byId.get(doc.id);
    if (meta?.matchSnippet && !doc.matchSnippet) doc.matchSnippet = meta.matchSnippet as string;
    if (meta?.matchedAlias && !doc.matchedAlias) doc.matchedAlias = meta.matchedAlias as string;
  }
  return cached.searchedTerms ?? cached.alsoSearched?.map((phrase) => ({ phrase, matches: 0 }));
}

async function retrieveDocuments(
  query: string,
  budget: SynthesisBudget,
  dateFrom?: string,
  dateTo?: string,
  ids?: number[],
  tier: ResearchTierFilter = 'all',
  docsKey?: string,
): Promise<{
  docs: ResearchDocument[];
  prompt: string;
  /** Hybrid-retrieval chip phrases — quote-verification exemptions (#718). */
  searchedPhrases: string[];
} | null> {
  // Preferred path (#552): the client passes the exact ordered doc ids from
  // the docsOnly phase, so citations [Doc N] are guaranteed to match the doc
  // cards — and the redundant embedding + vector search is skipped entirely.
  if (ids && ids.length > 0) {
    const docs = await fetchResearchDocsByIds(ids.slice(0, budget.contextDocs));
    if (docs.length === 0) return null;
    const alsoSearched = await attachCachedSnippets(docs, docsKey);
    await enrichDocsForSynthesis(docs, query);
    return {
      docs,
      prompt: buildSinglePassPrompt(query, docs, null, alsoSearched),
      searchedPhrases: (alsoSearched ?? []).map((t) => t.phrase),
    };
  }

  const embedding = await embedQueryCached(query);
  // Distinguish an embedding outage from a genuinely empty result: the
  // client shows "no documents" for null, which is wrong for a provider blip.
  if (!embedding)
    throw new Error('Search is temporarily unavailable. Please try the search again.');

  const retrieveStart = Date.now();
  const { documents: allDocs, minedAliases } = await searchResearchWithMeta(
    query,
    budget.contextDocs,
    embedding,
    dateFrom,
    dateTo,
    tier,
  );
  console.log(
    `[api/search/stream] timings retrieve=${Date.now() - retrieveStart}ms docs=${allDocs.length}`,
  );
  if (allDocs.length === 0) return null;

  // Skip corpus stats — scanning 164K embeddings takes 15-20s and delays
  // the first streamed byte past EventSource timeout. The synthesis prompt
  // works without corpus stats (they add context but aren't required).
  const contextDocs = allDocs.slice(0, budget.contextDocs);
  await enrichDocsForSynthesis(contextDocs, query);
  return {
    docs: contextDocs,
    prompt: buildSinglePassPrompt(query, contextDocs, null, minedAliases),
    searchedPhrases: minedAliases.map((a) => a.phrase),
  };
}

/** Deterministic quote verification (#707) emitted as an ALWAYS-present
 *  event (#725): every quoted span is checked against its cited document's
 *  full stored content before 'done'; a null result (DB error) emits
 *  `unavailable: true` so a broken verifier is visible. Timed (#726). */
async function verifyAndEmit(
  answer: string,
  docs: ResearchDocument[],
  searchedPhrases: string[],
  res: NextApiResponse,
) {
  const verifyStart = Date.now();
  const verification = await verifyAnswerQuotes(
    answer,
    docs.map((d, i) => ({ citationIndex: i + 1, id: d.id })),
    searchedPhrases,
  );
  const verificationMs = Date.now() - verifyStart;
  if (verification) {
    if (verification.unverified.length > 0) {
      console.warn(
        `[api/search/stream] quote verification: ${verification.unverified.length}/${verification.totalQuotes} unverified`,
      );
    }
    sendEvent(res, { type: 'verification', verificationMs, ...verification });
  } else {
    console.warn('[api/search/stream] quote verification unavailable for this answer');
    sendEvent(res, { type: 'verification', unavailable: true, verificationMs });
  }
}

async function streamCompletion(
  provider: AnthropicProvider,
  retrieved: { prompt: string; docs: ResearchDocument[]; searchedPhrases: string[] },
  maxTokens: number,
  res: NextApiResponse,
  clientGone: () => boolean,
) {
  const { prompt, docs, searchedPhrases } = retrieved;
  const stream = provider.completeStream(prompt, {
    model: SINGLE_PASS_MODEL,
    maxTokens,
    systemPrompt: SYSTEM_SINGLE_PASS,
    // Low temperature: factual synthesis, not creative writing (#707).
    temperature: SYNTHESIS_TEMPERATURE,
  });

  let accumulated = '';
  let result = await stream.next();
  while (!result.done) {
    if (clientGone()) {
      // Client dropped (new search or navigation): stop the model call via
      // the generator's finally-abort instead of billing to completion.
      await stream.return(undefined as never);
      console.log('[api/search/stream] client disconnected — synthesis aborted');
      return;
    }
    accumulated += result.value;
    sendEvent(res, { type: 'chunk', text: result.value });
    result = await stream.next();
  }

  await verifyAndEmit(accumulated, docs, searchedPhrases, res);

  const completion = result.value;
  sendEvent(res, {
    type: 'done',
    model: completion.model,
    latencyMs: completion.latencyMs,
    tokensUsed: completion.tokensUsed,
  });
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

  const provider = new AnthropicProvider();
  if (!provider.isAvailable()) {
    res.status(503).json({ error: 'Anthropic API key not configured' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let disconnected = false;
  res.once('close', () => {
    disconnected = true;
  });

  try {
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const ids = parseIdsParam(req.query.ids as string | undefined);
    const tier = (req.query.tier as ResearchTierFilter | undefined) ?? 'all';
    const docsKey = req.query.dk as string | undefined;
    const budget = budgetForQuestion(query);
    const retrieved = await retrieveDocuments(query, budget, dateFrom, dateTo, ids, tier, docsKey);
    if (!retrieved) {
      sendEvent(res, { type: 'error', message: 'No matching documents found' });
      res.end();
      return;
    }
    // Debug trace (#718): surface the exact synthesis prompt so a captured
    // search log carries the full context the model saw.
    if (req.query.debug === '1') {
      sendEvent(res, { type: 'debug', synthesisPrompt: retrieved.prompt });
    }
    await streamCompletion(provider, retrieved, budget.maxTokens, res, () => disconnected);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stream failed';
    console.error('[api/search/stream] Error:', err);
    sendEvent(res, { type: 'error', message });
  } finally {
    res.end();
  }
}
