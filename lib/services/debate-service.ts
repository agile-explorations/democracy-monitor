import type { DebateMessage, DebateResult, DebateVerdict } from '@/lib/types/debate';
import { getProvider, getAvailableProviders } from '@/lib/ai/provider';
import { PROSECUTOR_SYSTEM_PROMPT, buildProsecutorOpeningPrompt, buildProsecutorRebuttalPrompt } from '@/lib/ai/prompts/debate-prosecutor';
import { DEFENSE_SYSTEM_PROMPT, buildDefenseOpeningPrompt, buildDefenseRebuttalPrompt } from '@/lib/ai/prompts/debate-defense';
import { ARBITRATOR_SYSTEM_PROMPT, buildArbitratorPrompt } from '@/lib/ai/prompts/debate-arbitrator';
import { cacheGet, cacheSet } from '@/lib/cache';

const TOTAL_ROUNDS = 5; // opening, opening, rebuttal, rebuttal, verdict

export async function runDebate(
  category: string,
  status: string,
  evidence: string[]
): Promise<DebateResult | null> {
  const cacheKey = `debate:${category}:${Date.now() - (Date.now() % (6 * 60 * 60 * 1000))}`;
  const cached = await cacheGet<DebateResult>(cacheKey);
  if (cached) return cached;

  const providers = getAvailableProviders();
  if (providers.length < 2) return null;

  // Assign: Claude = prosecutor, OpenAI = defense (or vice versa)
  const anthropicProvider = providers.find(p => p.name === 'anthropic');
  const openaiProvider = providers.find(p => p.name === 'openai');
  if (!anthropicProvider || !openaiProvider) return null;

  const startedAt = new Date().toISOString();
  const messages: DebateMessage[] = [];

  // Round 1: Prosecutor opening (Claude)
  const prosecutorOpening = await anthropicProvider.complete(
    buildProsecutorOpeningPrompt(category, status, evidence),
    { systemPrompt: PROSECUTOR_SYSTEM_PROMPT, maxTokens: 500, temperature: 0.7 }
  );
  messages.push({
    role: 'prosecutor',
    provider: anthropicProvider.name,
    model: prosecutorOpening.model,
    content: prosecutorOpening.content,
    round: 1,
    latencyMs: prosecutorOpening.latencyMs,
  });

  // Round 2: Defense opening (OpenAI)
  const defenseOpening = await openaiProvider.complete(
    buildDefenseOpeningPrompt(category, status, evidence, prosecutorOpening.content),
    { systemPrompt: DEFENSE_SYSTEM_PROMPT, maxTokens: 500, temperature: 0.7 }
  );
  messages.push({
    role: 'defense',
    provider: openaiProvider.name,
    model: defenseOpening.model,
    content: defenseOpening.content,
    round: 2,
    latencyMs: defenseOpening.latencyMs,
  });

  // Round 3: Prosecutor rebuttal (Claude)
  const prosecutorRebuttal = await anthropicProvider.complete(
    buildProsecutorRebuttalPrompt(defenseOpening.content),
    { systemPrompt: PROSECUTOR_SYSTEM_PROMPT, maxTokens: 400, temperature: 0.7 }
  );
  messages.push({
    role: 'prosecutor',
    provider: anthropicProvider.name,
    model: prosecutorRebuttal.model,
    content: prosecutorRebuttal.content,
    round: 3,
    latencyMs: prosecutorRebuttal.latencyMs,
  });

  // Round 4: Defense rebuttal (OpenAI)
  const defenseRebuttal = await openaiProvider.complete(
    buildDefenseRebuttalPrompt(prosecutorRebuttal.content),
    { systemPrompt: DEFENSE_SYSTEM_PROMPT, maxTokens: 400, temperature: 0.7 }
  );
  messages.push({
    role: 'defense',
    provider: openaiProvider.name,
    model: defenseRebuttal.model,
    content: defenseRebuttal.content,
    round: 4,
    latencyMs: defenseRebuttal.latencyMs,
  });

  // Round 5: Arbitrator verdict (alternating provider)
  const arbitratorProvider = anthropicProvider; // Claude for nuanced judgment
  const arbitratorResult = await arbitratorProvider.complete(
    buildArbitratorPrompt(category, status, messages.map(m => ({ role: m.role, content: m.content }))),
    { systemPrompt: ARBITRATOR_SYSTEM_PROMPT, maxTokens: 500, temperature: 0.3 }
  );

  let verdict: DebateVerdict;
  try {
    const jsonMatch = arbitratorResult.content.match(/\{[\s\S]*\}/);
    verdict = JSON.parse(jsonMatch?.[0] || '{}');
  } catch {
    verdict = {
      agreementLevel: 5,
      verdict: 'mixed',
      summary: arbitratorResult.content.slice(0, 300),
      keyPoints: [],
    };
  }

  messages.push({
    role: 'arbitrator',
    provider: arbitratorProvider.name,
    model: arbitratorResult.model,
    content: arbitratorResult.content,
    round: 5,
    latencyMs: arbitratorResult.latencyMs,
  });

  const completedAt = new Date().toISOString();
  const totalLatencyMs = messages.reduce((sum, m) => sum + m.latencyMs, 0);

  const result: DebateResult = {
    category,
    status,
    messages,
    verdict,
    totalRounds: TOTAL_ROUNDS,
    startedAt,
    completedAt,
    totalLatencyMs,
  };

  await cacheSet(cacheKey, result, 6 * 60 * 60);
  return result;
}
