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
import { searchCorpusStats } from '@/lib/services/search-research-queries';
import type { ResearchDocument } from '@/lib/services/search-service';
import { searchResearch } from '@/lib/services/search-service';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

const SINGLE_PASS_MODEL = 'claude-sonnet-4-6';
const CONTEXT_DOCS = 20;

const SYSTEM_SINGLE_PASS =
  'You are a research analyst answering questions about U.S. government actions. ' +
  'Your answers are grounded exclusively in the provided government documents. ' +
  'Apply the self-verification checklist before finalizing your answer.';

export const config = { api: { responseLimit: false } };

function sendEvent(res: NextApiResponse, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function retrieveDocuments(query: string): Promise<{
  docs: ResearchDocument[];
  prompt: string;
} | null> {
  const embedding = await embedText(query);
  if (!embedding) return null;

  const allDocs = await searchResearch(query, CONTEXT_DOCS, embedding);
  if (allDocs.length === 0) return null;

  const leastSimilarity = Math.min(...allDocs.map((d) => d.cosineSimilarity));
  const corpusStats =
    leastSimilarity > 0 ? await searchCorpusStats(embedding, 1 - leastSimilarity) : null;

  const contextDocs = allDocs.slice(0, CONTEXT_DOCS);
  return { docs: contextDocs, prompt: buildSinglePassPrompt(query, contextDocs, corpusStats) };
}

async function streamCompletion(provider: AnthropicProvider, prompt: string, res: NextApiResponse) {
  const stream = provider.completeStream(prompt, {
    model: SINGLE_PASS_MODEL,
    maxTokens: 4096,
    systemPrompt: SYSTEM_SINGLE_PASS,
  });

  let result = await stream.next();
  while (!result.done) {
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

  try {
    const retrieved = await retrieveDocuments(query);
    if (!retrieved) {
      sendEvent(res, { type: 'error', message: 'No matching documents found' });
      res.end();
      return;
    }
    await streamCompletion(provider, retrieved.prompt, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stream failed';
    console.error('[api/search/stream] Error:', err);
    sendEvent(res, { type: 'error', message });
  } finally {
    res.end();
  }
}
