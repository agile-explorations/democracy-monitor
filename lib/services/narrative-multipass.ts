/**
 * Multi-pass narrative generation — Claude draft → GPT-4o feedback → Claude final.
 *
 * Each API call gets 3 retries. All 3 calls for a category-week narrative
 * must succeed (transactional) — if any fails, nothing is stored.
 */

import { getProvider } from '@/lib/ai/provider';
import type { AICompletionResult, MultiPassNarrativeResult, NarrativeLayerData } from '@/lib/types';
import { buildDraftPrompt, buildFeedbackPrompt, buildRevisionPrompt } from './narrative-prompts';

const DRAFT_MODEL = 'claude-opus-4-6';
const FEEDBACK_MODEL = 'gpt-4o';
const FINAL_MODEL = 'claude-opus-4-6';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 3000, 8000];

const SYSTEM_PROMPT_DRAFT =
  'You are an expert analyst for a democratic institution monitoring system. ' +
  'You produce rigorous, evidence-based analysis grounded in specific documents and metrics.';

const SYSTEM_PROMPT_FEEDBACK =
  'You are an independent editorial reviewer for a democratic institution monitoring system. ' +
  'Your role is epistemic auditing — checking factual accuracy, confidence calibration, ' +
  'and balanced characterization of government actions.';

const SYSTEM_PROMPT_REVISION =
  'You are an expert analyst for a democratic institution monitoring system. ' +
  'You are revising a draft narrative based on structured editorial feedback. ' +
  'Address each feedback item, but do not fundamentally rewrite the analysis.';

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

async function callWithRetry(
  fn: () => Promise<AICompletionResult>,
  label: string,
): Promise<AICompletionResult> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BACKOFF_MS[attempt] ?? 8000;
        console.warn(
          `[narrative] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error(`${label} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// ---------------------------------------------------------------------------
// Draft parsing
// ---------------------------------------------------------------------------

const EXPERT_HEADER = '=== EXPERT NARRATIVE ===';
const PUBLIC_HEADER = '=== PUBLIC NARRATIVE ===';

/** Parse a combined expert+public response into separate sections. */
export function parseDraftResponse(response: string): { expert: string; public: string } {
  const expertIdx = response.indexOf(EXPERT_HEADER);
  const publicIdx = response.indexOf(PUBLIC_HEADER);

  if (expertIdx === -1 || publicIdx === -1) {
    // Fallback: treat the whole response as expert, generate a truncated public
    return { expert: response.trim(), public: response.trim() };
  }

  const expert = response.slice(expertIdx + EXPERT_HEADER.length, publicIdx).trim();
  const pub = response.slice(publicIdx + PUBLIC_HEADER.length).trim();

  return { expert, public: pub };
}

// ---------------------------------------------------------------------------
// Multi-pass generation
// ---------------------------------------------------------------------------

export interface MultiPassError {
  pass: number;
  error: string;
}

/** Run a single pass with retry + pass-info error enrichment. */
async function runPass(
  provider: {
    complete: (
      prompt: string,
      opts: { model: string; maxTokens: number; systemPrompt: string },
    ) => Promise<AICompletionResult>;
  },
  prompt: string,
  opts: { model: string; maxTokens: number; systemPrompt: string },
  passNumber: number,
  label: string,
): Promise<AICompletionResult> {
  try {
    return await callWithRetry(() => provider.complete(prompt, opts), label);
  } catch (err) {
    const error: MultiPassError = { pass: passNumber, error: (err as Error).message };
    throw Object.assign(new Error(error.error), { passInfo: error });
  }
}

/**
 * Generate a category-week narrative using the 3-pass pipeline.
 * Throws with pass information if any step fails after retries.
 */
export async function generateMultiPassNarrative(
  data: NarrativeLayerData,
): Promise<MultiPassNarrativeResult> {
  const claude = getProvider('anthropic');
  const openai = getProvider('openai');

  if (!claude.isAvailable()) {
    throw new Error('Anthropic API key not configured — cannot generate narratives');
  }
  if (!openai.isAvailable()) {
    throw new Error('OpenAI API key not configured — cannot generate feedback');
  }

  const draftResult = await runPass(
    claude,
    buildDraftPrompt(data),
    { model: DRAFT_MODEL, maxTokens: 4096, systemPrompt: SYSTEM_PROMPT_DRAFT },
    1,
    `Pass 1 draft [${data.category}]`,
  );
  const drafts = parseDraftResponse(draftResult.content);

  const feedbackResult = await runPass(
    openai,
    buildFeedbackPrompt(drafts.expert, drafts.public, data),
    { model: FEEDBACK_MODEL, maxTokens: 2048, systemPrompt: SYSTEM_PROMPT_FEEDBACK },
    2,
    `Pass 2 feedback [${data.category}]`,
  );

  const finalResult = await runPass(
    claude,
    buildRevisionPrompt(drafts.expert, drafts.public, feedbackResult.content, data),
    { model: FINAL_MODEL, maxTokens: 4096, systemPrompt: SYSTEM_PROMPT_REVISION },
    3,
    `Pass 3 revision [${data.category}]`,
  );
  const finals = parseDraftResponse(finalResult.content);

  return {
    expertDraft: drafts.expert,
    publicDraft: drafts.public,
    feedback: feedbackResult.content,
    expert: finals.expert,
    public: finals.public,
    draftModel: draftResult.model,
    feedbackModel: feedbackResult.model,
    finalModel: finalResult.model,
  };
}
