import { buildPass1Prompt, PASS1_SYSTEM_PROMPT } from '@/lib/ai/prompts/layer2-pass1';
import { buildPass2Prompt, PASS2_SYSTEM_PROMPT } from '@/lib/ai/prompts/layer2-pass2';
import type { Pass1Response, Pass2Response } from '@/lib/ai/schemas/layer2-response';
import { parsePass1Response, parsePass2Response } from '@/lib/ai/schemas/layer2-response';
import type { AIProvider, ContentItem } from '@/lib/types';
import type { AIAssessmentSummary } from '@/lib/types/structural';

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

/**
 * Run Pass 1 classification on a single document.
 * Returns null if AI call fails or response cannot be parsed.
 */
export async function assessPass1(
  doc: ContentItem,
  categoryDescription: string,
  provider: AIProvider,
  model?: string,
): Promise<Pass1Result | null> {
  const prompt = buildPass1Prompt(
    doc.title ?? '',
    doc.summary,
    doc.type ?? 'unknown',
    doc.agency,
    doc.pubDate,
    categoryDescription,
  );

  try {
    const result = await provider.complete(prompt, {
      systemPrompt: PASS1_SYSTEM_PROMPT,
      temperature: 0,
      model,
    });

    const parsed = parsePass1Response(result.content);
    if (!parsed) return null;

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
): Promise<Pass2Result | null> {
  const prompt = buildPass2Prompt(
    doc.title ?? '',
    doc.summary,
    pass1Signals,
    pass1ErosionType,
    categoryDescription,
  );

  try {
    const result = await provider.complete(prompt, {
      systemPrompt: PASS2_SYSTEM_PROMPT,
      temperature: 0,
      model,
      maxTokens: 2048,
    });

    const parsed = parsePass2Response(result.content);
    if (!parsed) return null;

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
      isAuditSample,
    };
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
