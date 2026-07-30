import { buildPass1Prompt, PASS1_SYSTEM_PROMPT } from '@/lib/ai/prompts/document-review-pass1';
import type { Pass2WeekContext } from '@/lib/ai/prompts/document-review-pass2';
import { buildPass2Prompt, PASS2_SYSTEM_PROMPT } from '@/lib/ai/prompts/document-review-pass2';
import type { Pass1Response, Pass2Response } from '@/lib/ai/schemas/document-review-response';
import { parsePass1Response, parsePass2Response } from '@/lib/ai/schemas/document-review-response';
import { assertAiCallBudget, recordAiCall } from '@/lib/services/ai-call-budget';
import type { AIProvider, ContentItem } from '@/lib/types';
import { EROSION_ACTORS } from '@/lib/types/structural';
import type { ActorConfirmations, AIAssessmentSummary } from '@/lib/types/structural';

export interface AssessmentMeta {
  model: string;
  provider: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
}

export interface Pass1Result {
  url: string;
  response: Pass1Response;
  meta: AssessmentMeta;
}

export interface Pass2Result {
  url: string;
  response: Pass2Response;
  meta: AssessmentMeta;
  isAuditSample: boolean;
}

/** Retry temperature when a temp-0 response is unparseable (breaks deterministic failures). */
const PARSE_RETRY_TEMPERATURE = 0.3;

/**
 * Complete a Pass 1 prompt, retrying once at a warmer temperature when the
 * temp-0 response is unparseable — at temperature 0 an unparseable response
 * is deterministic, permanently excluding the doc from assessment (#528).
 */
async function completePass1WithParseRetry(
  provider: AIProvider,
  prompt: string,
  model: string | undefined,
  docLabel: string,
) {
  recordAiCall();
  let result = await provider.complete(prompt, {
    systemPrompt: PASS1_SYSTEM_PROMPT,
    temperature: 0,
    model,
  });
  let parsed = parsePass1Response(result.content);
  if (!parsed) {
    console.warn(`[layer2] Pass 1 unparseable at temp 0 for ${docLabel}, retrying`);
    recordAiCall();
    result = await provider.complete(prompt, {
      systemPrompt: PASS1_SYSTEM_PROMPT,
      temperature: PARSE_RETRY_TEMPERATURE,
      model,
    });
    parsed = parsePass1Response(result.content);
  }
  return { result, parsed };
}

/**
 * Run Pass 1 classification on a single document.
 * Returns null if AI call fails or response cannot be parsed (after one retry).
 */
export async function assessPass1(
  doc: ContentItem,
  categoryDescription: string,
  provider: AIProvider,
  model?: string,
): Promise<Pass1Result | null> {
  // Budget check OUTSIDE the try below — the per-doc catch must not swallow
  // a budget stop into a skipped document (#564).
  assertAiCallBudget();

  const prompt = buildPass1Prompt(
    doc.title ?? '',
    doc.content,
    doc.type ?? 'unknown',
    doc.agency,
    doc.pubDate,
    categoryDescription,
  );

  try {
    const { result, parsed } = await completePass1WithParseRetry(
      provider,
      prompt,
      model,
      doc.link ?? doc.title ?? 'unknown',
    );
    if (!parsed) {
      console.warn(
        `[layer2] Pass 1 unparseable after retry for ${doc.link ?? doc.title}: ` +
          result.content.slice(0, 160).replace(/\n/g, ' '),
      );
      return null;
    }

    return {
      url: doc.link ?? doc.title ?? 'unknown',
      response: parsed,
      meta: {
        model: result.model,
        provider: provider.name,
        tokensInput: result.tokensUsed.input,
        tokensOutput: result.tokensUsed.output,
        latencyMs: result.latencyMs,
      },
    };
  } catch (err) {
    console.warn(`[layer2] Pass 1 failed for ${doc.link ?? doc.title}:`, (err as Error).message);
    return null;
  }
}

/**
 * Parse failures are deterministic for a given doc+prompt, so silent nulls
 * become permanently stuck flagged-without-P2 docs (#612) — always log the
 * doc and a bounded head of the unparseable response.
 */
function warnUnparseablePass2(doc: ContentItem, raw: string): void {
  console.warn(
    `[layer2] Pass 2 UNPARSEABLE for ${doc.link ?? doc.title}: ` +
      `"${raw.slice(0, 200).replace(/\s+/g, ' ')}"`,
  );
}

/**
 * Complete a Pass 2 prompt, retrying once at a warmer temperature when the
 * temp-0 response is unparseable — the same deterministic-failure escape
 * Pass 1 has had since #528; its absence here left 32 flagged docs
 * permanently without a verdict (#612).
 */
async function completePass2WithParseRetry(
  provider: AIProvider,
  prompt: string,
  model: string | undefined,
  docLabel: string,
) {
  recordAiCall();
  let result = await provider.complete(prompt, {
    systemPrompt: PASS2_SYSTEM_PROMPT,
    temperature: 0,
    model,
    maxTokens: 2048,
  });
  let parsed = parsePass2Response(result.content);
  if (!parsed) {
    console.warn(`[layer2] Pass 2 unparseable at temp 0 for ${docLabel}, retrying`);
    recordAiCall();
    result = await provider.complete(prompt, {
      systemPrompt: PASS2_SYSTEM_PROMPT,
      temperature: PARSE_RETRY_TEMPERATURE,
      model,
      maxTokens: 2048,
    });
    parsed = parsePass2Response(result.content);
  }
  return { result, parsed };
}

/** Assemble the stored Pass 2 result from a parsed response + call metadata. */
function toPass2Result(
  doc: ContentItem,
  parsed: Pass2Response,
  result: { model: string; tokensUsed: { input: number; output: number }; latencyMs: number },
  providerName: string,
  isAuditSample: boolean,
): Pass2Result {
  return {
    url: doc.link ?? doc.title ?? 'unknown',
    response: parsed,
    meta: {
      model: result.model,
      provider: providerName,
      tokensInput: result.tokensUsed.input,
      tokensOutput: result.tokensUsed.output,
      latencyMs: result.latencyMs,
    },
    isAuditSample,
  };
}

/**
 * Run Pass 2 deep analysis on a flagged (or audit sample) document.
 * Returns null if AI call fails or response cannot be parsed.
 */
export async function assessPass2(
  doc: ContentItem,
  pass1Signals: string[],
  pass1ErosionType: string,
  categoryDescription: string,
  provider: AIProvider,
  isAuditSample: boolean,
  model?: string,
  weekContext?: Pass2WeekContext,
): Promise<Pass2Result | null> {
  assertAiCallBudget();

  const prompt = buildPass2Prompt(
    doc.title ?? '',
    doc.content,
    pass1Signals,
    pass1ErosionType,
    categoryDescription,
    weekContext,
    doc.type,
    doc.link,
  );

  try {
    const docLabel = doc.link ?? doc.title ?? 'unknown';
    const { result, parsed } = await completePass2WithParseRetry(provider, prompt, model, docLabel);
    if (!parsed) {
      warnUnparseablePass2(doc, result.content);
      return null;
    }
    return toPass2Result(doc, parsed, result, provider.name, isAuditSample);
  } catch (err) {
    console.warn(`[layer2] Pass 2 failed for ${doc.link ?? doc.title}:`, (err as Error).message);
    return null;
  }
}

/**
 * Select a deterministic random sample of URLs for Pass 2 audit.
 * Pure function — uses a simple hash-based selection for reproducibility.
 */
export function selectAuditSample(unflaggedUrls: string[], sampleRate: number): string[] {
  if (sampleRate <= 0 || unflaggedUrls.length === 0) return [];
  const count = Math.max(1, Math.ceil(unflaggedUrls.length * sampleRate));
  // Sort for deterministic selection, then take first N
  const sorted = [...unflaggedUrls].sort();
  return sorted.slice(0, Math.min(count, sorted.length));
}

/**
 * Compute the AI assessment summary from Pass 1 + Pass 2 results.
 * Pure function — no I/O.
 */
export function computeAIAssessmentSummary(
  pass1Results: Pass1Result[],
  pass2Results: Pass2Result[],
  baselineFlagRate: number,
  baselineFlagRateStdDev: number,
  pass1Model: string,
  pass2Model: string,
): AIAssessmentSummary {
  const totalDocuments = pass1Results.length;
  const flagCount = pass1Results.filter((r) => r.response.relevant).length;
  const flagRate = totalDocuments > 0 ? flagCount / totalDocuments : 0;
  const flagRateZScore = computeZScore(flagRate, baselineFlagRate, baselineFlagRateStdDev);

  const nonAuditPass2 = pass2Results.filter((r) => !r.isAuditSample);
  const auditPass2 = pass2Results.filter((r) => r.isAuditSample);

  const concernDistribution = computeConcernDistribution(nonAuditPass2);
  const actorConfirmations = computeActorConfirmations(nonAuditPass2);
  const concerningCount =
    concernDistribution.potentiallyConcerning + concernDistribution.clearlyConcerning;
  const concernRate = nonAuditPass2.length > 0 ? concerningCount / nonAuditPass2.length : 0;

  const falseNegatives = auditPass2.filter((r) => isConcerning(r.response.assessment)).length;

  return {
    flagCount,
    totalDocuments,
    flagRate,
    baselineFlagRate,
    flagRateZScore,
    concernDistribution,
    actorConfirmations,
    concernRate,
    auditSample: {
      sampled: auditPass2.length,
      falseNegatives,
      falseNegativeRate: auditPass2.length > 0 ? falseNegatives / auditPass2.length : 0,
    },
    pass1Model,
    pass2Model,
  };
}

function isConcerning(assessment: string): boolean {
  return assessment === 'potentially_concerning' || assessment === 'clearly_concerning';
}

/**
 * Per-actor breakdown of confirmed assessments (#537). Rows without an
 * erosionActor land in 'unattributed' — a deliberate bucket that keeps
 * attribution coverage visible. Consumed by context surfaces and headline
 * prototyping only; concern synthesis never reads this.
 */
function computeActorConfirmations(results: Pass2Result[]): ActorConfirmations {
  const empty = () => ({ potentiallyConcerning: 0, clearlyConcerning: 0 });
  const buckets = Object.fromEntries(
    [...EROSION_ACTORS, 'unattributed'].map((a) => [a, empty()]),
  ) as ActorConfirmations;

  for (const r of results) {
    const key = r.response.erosionActor ?? 'unattributed';
    if (r.response.assessment === 'potentially_concerning') buckets[key].potentiallyConcerning++;
    else if (r.response.assessment === 'clearly_concerning') buckets[key].clearlyConcerning++;
  }
  return buckets;
}

function computeConcernDistribution(results: Pass2Result[]) {
  const dist = {
    routine: 0,
    novelNotConcerning: 0,
    potentiallyConcerning: 0,
    clearlyConcerning: 0,
  };

  for (const r of results) {
    switch (r.response.assessment) {
      case 'routine':
        dist.routine++;
        break;
      case 'novel_not_concerning':
        dist.novelNotConcerning++;
        break;
      case 'potentially_concerning':
        dist.potentiallyConcerning++;
        break;
      case 'clearly_concerning':
        dist.clearlyConcerning++;
        break;
    }
  }

  return dist;
}

/** Scaling factor when stddev is zero — amplifies any deviation from the mean. */
const ZERO_STDDEV_SCALE = 10;

function computeZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return value === mean ? 0 : Math.abs(value - mean) * ZERO_STDDEV_SCALE;
  return (value - mean) / stdDev;
}
