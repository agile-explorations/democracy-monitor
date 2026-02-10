import {
  ARBITRATOR_SYSTEM_PROMPT,
  buildArbitratorPrompt,
} from '@/lib/ai/prompts/debate-arbitrator';
import {
  DEFENSE_SYSTEM_PROMPT,
  buildDefenseOpeningPrompt,
  buildDefenseRebuttalPrompt,
} from '@/lib/ai/prompts/debate-defense';
import {
  PROSECUTOR_SYSTEM_PROMPT,
  buildProsecutorOpeningPrompt,
  buildProsecutorRebuttalPrompt,
} from '@/lib/ai/prompts/debate-prosecutor';
import { getAvailableProviders } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { AI_CACHE_BUCKET_MS, AI_CACHE_TTL_S } from '@/lib/data/cache-config';
import type { AICompletionOptions, AIProvider } from '@/lib/types/ai';
import type { DebateMessage, DebateResult, DebateRole, DebateVerdict } from '@/lib/types/debate';
import { extractJsonFromLlm } from '@/lib/utils/ai-helpers';

const TOTAL_ROUNDS = 5; // opening, opening, rebuttal, rebuttal, verdict

const FALLBACK_VERDICT: Omit<DebateVerdict, 'summary'> = {
  agreementLevel: 5,
  verdict: 'mixed',
  keyPoints: [],
};

async function runDebateRound(
  provider: AIProvider,
  prompt: string,
  options: AICompletionOptions,
  role: DebateRole,
  round: number,
): Promise<DebateMessage> {
  const result = await provider.complete(prompt, options);
  return {
    role,
    provider: provider.name,
    model: result.model,
    content: result.content,
    round,
    latencyMs: result.latencyMs,
  };
}

async function runArgumentRounds(
  anthropic: AIProvider,
  openai: AIProvider,
  category: string,
  status: string,
  evidence: string[],
): Promise<DebateMessage[]> {
  const prosOpts: AICompletionOptions = {
    systemPrompt: PROSECUTOR_SYSTEM_PROMPT,
    maxTokens: 500,
    temperature: 0.7,
  };
  const defOpts: AICompletionOptions = {
    systemPrompt: DEFENSE_SYSTEM_PROMPT,
    maxTokens: 500,
    temperature: 0.7,
  };

  const r1 = await runDebateRound(
    anthropic,
    buildProsecutorOpeningPrompt(category, status, evidence),
    prosOpts,
    'prosecutor',
    1,
  );
  const r2 = await runDebateRound(
    openai,
    buildDefenseOpeningPrompt(category, status, evidence, r1.content),
    defOpts,
    'defense',
    2,
  );
  const r3 = await runDebateRound(
    anthropic,
    buildProsecutorRebuttalPrompt(r2.content),
    { ...prosOpts, maxTokens: 400 },
    'prosecutor',
    3,
  );
  const r4 = await runDebateRound(
    openai,
    buildDefenseRebuttalPrompt(r3.content),
    { ...defOpts, maxTokens: 400 },
    'defense',
    4,
  );
  return [r1, r2, r3, r4];
}

async function runArbitration(
  provider: AIProvider,
  category: string,
  status: string,
  messages: DebateMessage[],
): Promise<DebateMessage> {
  const arbPrompt = buildArbitratorPrompt(
    category,
    status,
    messages.map((m) => ({ role: m.role, content: m.content })),
  );
  return runDebateRound(
    provider,
    arbPrompt,
    { systemPrompt: ARBITRATOR_SYSTEM_PROMPT, maxTokens: 500, temperature: 0.3 },
    'arbitrator',
    5,
  );
}

export async function runDebate(
  category: string,
  status: string,
  evidence: string[],
): Promise<DebateResult | null> {
  const cacheKey = `debate:${category}:${Date.now() - (Date.now() % AI_CACHE_BUCKET_MS)}`;
  const cached = await cacheGet<DebateResult>(cacheKey);
  if (cached) return cached;

  const providers = getAvailableProviders();
  if (providers.length < 2) return null;
  const anthropic = providers.find((p) => p.name === 'anthropic');
  const openai = providers.find((p) => p.name === 'openai');
  if (!anthropic || !openai) return null;

  const startedAt = new Date().toISOString();
  const argMsgs = await runArgumentRounds(anthropic, openai, category, status, evidence);
  const r5 = await runArbitration(anthropic, category, status, argMsgs);
  const messages = [...argMsgs, r5];
  const verdict: DebateVerdict = extractJsonFromLlm<DebateVerdict>(r5.content) || {
    ...FALLBACK_VERDICT,
    summary: r5.content.slice(0, 300),
  };

  const result: DebateResult = {
    category,
    status,
    messages,
    verdict,
    totalRounds: TOTAL_ROUNDS,
    startedAt,
    completedAt: new Date().toISOString(),
    totalLatencyMs: messages.reduce((sum, m) => sum + m.latencyMs, 0),
  };

  await cacheSet(cacheKey, result, AI_CACHE_TTL_S);
  return result;
}
