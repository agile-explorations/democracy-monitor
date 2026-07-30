/**
 * SSE streaming endpoint for single-pass research synthesis.
 *
 * GET /api/search/stream?q=...
 *
 * Events:
 *   data: {"type":"chunk","text":"..."} — incremental LLM output
 *   data: {"type":"done","model":"...","latencyMs":N,"tokensUsed":{...}} — completion metadata
 *   data: {"type":"error","message":"..."} — error
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { AnthropicProvider } from '@/lib/ai/anthropic';
import { embedText } from '@/lib/services/embedding-service';
import { buildSinglePassPrompt } from '@/lib/services/research-prompts';
import type { ResearchDocument, ResearchTierFilter } from '@/lib/services/search-service';
import { fetchResearchDocsByIds, searchResearch } from '@/lib/services/search-service';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

const SINGLE_PASS_MODEL = 'claude-sonnet-4-6';
const CONTEXT_DOCS = 30;

const SYSTEM_SINGLE_PASS =
  'You are a research analyst answering questions about U.S. government actions. ' +
  'Your answers are grounded exclusively in the provided government documents. ' +
  'Apply the self-verification checklist before finalizing your answer.';

export const config = { api: { responseLimit: false } };

function sendEvent(res: NextApiResponse, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function retrieveDocuments(
  query: string,
  dateFrom?: string,
  dateTo?: string,
  ids?: number[],
  tier: ResearchTierFilter = 'all',
): Promise<{
  docs: ResearchDocument[];
  prompt: string;
} | null> {
  // Preferred path (#552): the client passes the exact ordered doc ids from
  // the docsOnly phase, so citations [Doc N] are guaranteed to match the doc
  // cards — and the redundant embedding + vector search is skipped entirely.
  if (ids && ids.length > 0) {
    const docs = await fetchResearchDocsByIds(ids.slice(0, CONTEXT_DOCS));
    if (docs.length === 0) return null;
    return { docs, prompt: buildSinglePassPrompt(query, docs, null) };
  }

  const embedding = await embedText(query);
  if (!embedding) return null;

  const allDocs = await searchResearch(query, CONTEXT_DOCS, embedding, dateFrom, dateTo, tier);
  if (allDocs.length === 0) return null;

  // Skip corpus stats — scanning 164K embeddings takes 15-20s and delays
  // the first streamed byte past EventSource timeout. The synthesis prompt
  // works without corpus stats (they add context but aren't required).
  const contextDocs = allDocs.slice(0, CONTEXT_DOCS);
  return { docs: contextDocs, prompt: buildSinglePassPrompt(query, contextDocs, null) };
}

async function streamCompletion(
  provider: AnthropicProvider,
  prompt: string,
  res: NextApiResponse,
  clientGone: () => boolean,
) {
  const stream = provider.completeStream(prompt, {
    model: SINGLE_PASS_MODEL,
    maxTokens: 4096,
    systemPrompt: SYSTEM_SINGLE_PASS,
  });

  let result = await stream.next();
  while (!result.done) {
    if (clientGone()) {
      // Client dropped (new search or navigation): stop the model call via
      // the generator's finally-abort instead of billing to completion.
      await stream.return(undefined as never);
      console.log('[api/search/stream] client disconnected — synthesis aborted');
      return;
    }
    sendEvent(res, { type: 'chunk', text: result.value });
    result = await stream.next();
  }

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
    const idsParam = req.query.ids as string | undefined;
    const ids = idsParam
      ? idsParam
          .split(',')
          .map((s) => parseInt(s, 10))
          .filter((n) => Number.isFinite(n))
      : undefined;
    const tier = (req.query.tier as ResearchTierFilter | undefined) ?? 'all';
    const retrieved = await retrieveDocuments(query, dateFrom, dateTo, ids, tier);
    if (!retrieved) {
      sendEvent(res, { type: 'error', message: 'No matching documents found' });
      res.end();
      return;
    }
    await streamCompletion(provider, retrieved.prompt, res, () => disconnected);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stream failed';
    console.error('[api/search/stream] Error:', err);
    sendEvent(res, { type: 'error', message });
  } finally {
    res.end();
  }
}
