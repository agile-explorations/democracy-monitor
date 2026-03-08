/**
 * Research synthesis — 3-pass RAG pipeline for search answers.
 *
 * Pass 1 (Claude Opus): Draft answer with [Doc N] citations, expert + public.
 * Pass 2 (GPT-4o): Editorial review for accuracy, calibration, balance.
 * Pass 3 (Claude Opus): Revision incorporating feedback.
 */

import { getProvider } from '@/lib/ai/provider';
import type { AICompletionResult } from '@/lib/types';
import { buildDraftPrompt, buildFeedbackPrompt, buildRevisionPrompt } from './research-prompts';
import type { ResearchDocument } from './search-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAFT_MODEL = 'claude-opus-4-6';
const FEEDBACK_MODEL = 'gpt-4o';
const FINAL_MODEL = 'claude-opus-4-6';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 3000, 8000];

const EXPERT_HEADER = '=== EXPERT ANSWER ===';
const PUBLIC_HEADER = '=== PUBLIC ANSWER ===';
const QUESTIONS_HEADER = '=== RELATED QUESTIONS ===';

const SYSTEM_DRAFT =
  'You are a research analyst answering questions about U.S. government actions. ' +
  'Your answers are grounded exclusively in the provided government documents.';
const SYSTEM_FEEDBACK =
  'You are an independent editorial reviewer. Your role is epistemic auditing — ' +
  'checking factual accuracy, citation correctness, confidence calibration, and balance.';
const SYSTEM_REVISION =
  'You are a research analyst revising answers based on editorial feedback. ' +
  'Address each feedback item while maintaining the grounded, citation-based approach.';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResearchSynthesisResult {
  expertDraft: string;
  publicDraft: string;
  feedback: string;
  expert: string;
  public: string;
  relatedQuestions: string[];
  draftModel: string;
  feedbackModel: string;
  finalModel: string;
}

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
        console.warn(`[research] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error(`${label} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// ---------------------------------------------------------------------------
// Response parsers
// ---------------------------------------------------------------------------

export function parseDraftResponse(response: string): {
  expert: string;
  public: string;
  relatedQuestions: string[];
} {
  const expertIdx = response.indexOf(EXPERT_HEADER);
  const publicIdx = response.indexOf(PUBLIC_HEADER);
  const questionsIdx = response.indexOf(QUESTIONS_HEADER);

  let expert: string;
  let pub: string;

  if (expertIdx === -1 || publicIdx === -1) {
    const mainText = questionsIdx !== -1 ? response.slice(0, questionsIdx).trim() : response.trim();
    expert = mainText;
    pub = mainText;
  } else {
    const publicEnd = questionsIdx !== -1 ? questionsIdx : response.length;
    expert = response.slice(expertIdx + EXPERT_HEADER.length, publicIdx).trim();
    pub = response.slice(publicIdx + PUBLIC_HEADER.length, publicEnd).trim();
  }

  let relatedQuestions: string[] = [];
  if (questionsIdx !== -1) {
    relatedQuestions = response
      .slice(questionsIdx + QUESTIONS_HEADER.length)
      .trim()
      .split('\n')
      .map((line) => line.replace(/^[-·•\d.)\s]+/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, 3);
  }

  return { expert, public: pub, relatedQuestions };
}

export function parseFinalResponse(response: string): { expert: string; public: string } {
  const expertIdx = response.indexOf(EXPERT_HEADER);
  const publicIdx = response.indexOf(PUBLIC_HEADER);
  if (expertIdx === -1 || publicIdx === -1) {
    return { expert: response.trim(), public: response.trim() };
  }
  return {
    expert: response.slice(expertIdx + EXPERT_HEADER.length, publicIdx).trim(),
    public: response.slice(publicIdx + PUBLIC_HEADER.length).trim(),
  };
}

// ---------------------------------------------------------------------------
// Main synthesis pipeline
// ---------------------------------------------------------------------------

export async function synthesizeResearchAnswer(
  query: string,
  documents: ResearchDocument[],
): Promise<ResearchSynthesisResult> {
  const claude = getProvider('anthropic');
  const openai = getProvider('openai');
  if (!claude.isAvailable()) throw new Error('Anthropic API key not configured');
  if (!openai.isAvailable()) throw new Error('OpenAI API key not configured');

  const draftResult = await callWithRetry(
    () =>
      claude.complete(buildDraftPrompt(query, documents), {
        model: DRAFT_MODEL,
        maxTokens: 4096,
        systemPrompt: SYSTEM_DRAFT,
      }),
    'Pass 1 draft',
  );
  const drafts = parseDraftResponse(draftResult.content);

  const feedbackResult = await callWithRetry(
    () =>
      openai.complete(buildFeedbackPrompt(drafts.expert, drafts.public, query, documents), {
        model: FEEDBACK_MODEL,
        maxTokens: 2048,
        systemPrompt: SYSTEM_FEEDBACK,
      }),
    'Pass 2 feedback',
  );

  const finalResult = await callWithRetry(
    () =>
      claude.complete(
        buildRevisionPrompt(drafts.expert, drafts.public, feedbackResult.content, query, documents),
        { model: FINAL_MODEL, maxTokens: 4096, systemPrompt: SYSTEM_REVISION },
      ),
    'Pass 3 revision',
  );
  const finals = parseFinalResponse(finalResult.content);

  return {
    expertDraft: drafts.expert,
    publicDraft: drafts.public,
    feedback: feedbackResult.content,
    expert: finals.expert,
    public: finals.public,
    relatedQuestions: drafts.relatedQuestions,
    draftModel: draftResult.model,
    feedbackModel: feedbackResult.model,
    finalModel: finalResult.model,
  };
}
