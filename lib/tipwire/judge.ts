/**
 * R-TIPWIRE judge (#856): one Sonnet call per article (two at most — one
 * parse retry at a warmer temperature, the #528/#612 deterministic-failure
 * escape). Spend discipline follows lib/services/ai-call-budget.ts: the
 * CALLER runs assertAiCallBudget() outside its per-article try/catch so a
 * cap trip propagates; this module records every request it makes.
 */

import { getProvider } from '@/lib/ai/provider';
import { MODEL_ROSTER } from '@/lib/data/model-roster';
import type { TipPayload } from '@/lib/db/schema';
import { recordAiCall } from '@/lib/services/ai-call-budget';
import type { AIProvider } from '@/lib/types/ai';
import { formatError } from '@/lib/utils/api-helpers';
import {
  TIP_PROMPT_VERSION,
  buildTipSystemPrompt,
  buildTipUserPrompt,
  parseTipVerdict,
} from './prompt';
import type { TipJudgeContext, TipVerdict } from './prompt';

export const JUDGE_MAX_TOKENS = 1024;
export const PARSE_RETRY_TEMPERATURE = 0.3;
/** Calls a single article can cost at most (first attempt + one parse retry). */
export const MAX_CALLS_PER_ARTICLE = 2;

export type JudgeVerdict = 'tip' | 'no_tip' | 'parse_failed' | 'error';

export interface JudgeResult {
  verdict: JudgeVerdict;
  tip?: TipPayload & { documentRef: number; documentId: number; searchKeys: string[] };
  reasonsNoTip?: string;
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  calls: number;
  /** Bounded head of the last raw response when parsing failed (for the log). */
  rawHead?: string;
  error?: string;
}

export interface JudgeDeps {
  provider?: AIProvider;
  model?: string;
}

function resolveProvider(deps: JudgeDeps): { provider: AIProvider; model: string } | null {
  const provider = deps.provider ?? getProvider('anthropic');
  if (!provider.isAvailable()) return null;
  return { provider, model: deps.model ?? MODEL_ROSTER.synthesisSinglePass.id };
}

type Accumulator = Omit<JudgeResult, 'verdict'>;

/** Map a validated verdict onto the result row (document_ref → real doc id). */
function toResult(v: TipVerdict, ctx: TipJudgeContext, acc: Accumulator): JudgeResult {
  if (v.verdict === 'no_tip' || !v.tip) {
    return { ...acc, verdict: 'no_tip', reasonsNoTip: v.reasons_no_tip ?? '' };
  }
  return {
    ...acc,
    verdict: 'tip',
    tip: {
      sentences: v.tip.sentences as [string, string, string],
      specificClaim: v.tip.specific_claim,
      whyUnreportedAppears: v.tip.why_unreported_appears,
      confidence: v.tip.confidence,
      searchKeys: v.tip.search_keys ?? [],
      documentRef: v.tip.document_ref,
      documentId: ctx.docs[v.tip.document_ref - 1].id,
    },
  };
}

/** One model request: records the call, accumulates tokens/latency, parses. */
async function attempt(
  provider: AIProvider,
  prompts: { system: string; user: string },
  model: string,
  temperature: number,
  ctx: TipJudgeContext,
  acc: Accumulator,
): Promise<{ result?: JudgeResult; rawHead: string }> {
  recordAiCall();
  acc.calls++;
  const res = await provider.complete(prompts.user, {
    systemPrompt: prompts.system,
    temperature,
    model,
    maxTokens: JUDGE_MAX_TOKENS,
  });
  acc.tokensIn += res.tokensUsed.input;
  acc.tokensOut += res.tokensUsed.output;
  acc.latencyMs += res.latencyMs;
  const parsed = parseTipVerdict(res.content, ctx.docs.length);
  if (parsed.ok) return { result: toResult(parsed.verdict, ctx, acc), rawHead: '' };
  console.warn(
    `[tipwire] judge ${parsed.reason} at temp ${temperature} for "${ctx.article.title.slice(0, 60)}"`,
  );
  return { rawHead: res.content.slice(0, 200).replace(/\s+/g, ' ') };
}

/** Judge one article. Never throws for model/parse problems; returns a verdict row. */
export async function judgeArticle(
  ctx: TipJudgeContext,
  deps: JudgeDeps = {},
): Promise<JudgeResult> {
  const resolved = resolveProvider(deps);
  const acc: Accumulator = {
    promptVersion: TIP_PROMPT_VERSION,
    model: resolved?.model ?? deps.model ?? 'n/a',
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    calls: 0,
  };
  if (!resolved) return { ...acc, verdict: 'error', error: 'anthropic provider unavailable' };
  const prompts = { system: buildTipSystemPrompt(ctx.kind), user: buildTipUserPrompt(ctx) };
  let rawHead = '';
  try {
    for (const temperature of [0, PARSE_RETRY_TEMPERATURE]) {
      const out = await attempt(resolved.provider, prompts, resolved.model, temperature, ctx, acc);
      if (out.result) return out.result;
      rawHead = out.rawHead;
    }
    return { ...acc, verdict: 'parse_failed', rawHead };
  } catch (err) {
    return { ...acc, verdict: 'error', error: formatError(err) };
  }
}
