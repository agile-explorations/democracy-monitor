import {
  buildSkepticReviewPrompt,
  SKEPTIC_REVIEW_SYSTEM_PROMPT,
} from '@/lib/ai/prompts/skeptic-review';
import { getAvailableProviders } from '@/lib/ai/provider';
import { parseSkepticReviewResponse } from '@/lib/ai/schemas/assessment-response';
import type { SkepticReviewResponse } from '@/lib/ai/schemas/assessment-response';
import { cacheGet, cacheSet } from '@/lib/cache';
import { AI_CACHE_TTL_S } from '@/lib/data/cache-config';
import { CATEGORIES } from '@/lib/data/categories';
import type {
  StatusLevel,
  AssessmentResult,
  ContentItem,
  AIProvider,
  EnhancedAssessment,
  EvidenceItem,
} from '@/lib/types';
import { analyzeContent } from './assessment-service';
import { calculateDataCoverage } from './confidence-scoring';
import { retrieveRelevantDocuments } from './document-retriever';
import { categorizeEvidence } from './evidence-balance';
import { buildKeywordMatchContexts, generateKeywordCounterEvidence } from './keyword-match-context';
import { flagForReview } from './review-queue';
import { resolveDowngrade, clampToCeiling } from './status-ordering';
import type { DowngradeDecision } from './status-ordering';

export type { EnhancedAssessment };

interface SkepticReviewResult {
  aiResult: NonNullable<EnhancedAssessment['aiResult']>;
  decision: DowngradeDecision;
  recommendedStatus: StatusLevel;
  keywordReview: SkepticReviewResponse['keywordReview'];
  whatWouldChangeMind: string;
  howWeCouldBeWrong: string[];
  additionalEvidenceFor: EvidenceItem[];
  additionalEvidenceAgainst: EvidenceItem[];
}

function mergeSkepticEvidence(
  evidenceFor: EvidenceItem[],
  evidenceAgainst: EvidenceItem[],
  skepticResult: SkepticReviewResult,
): void {
  for (const e of skepticResult.additionalEvidenceFor) {
    if (!evidenceFor.some((ef) => ef.text === e.text)) {
      evidenceFor.push(e);
    }
  }
  for (const e of skepticResult.additionalEvidenceAgainst) {
    if (!evidenceAgainst.some((ea) => ea.text === e.text)) {
      evidenceAgainst.push(e);
    }
  }
}

function buildEnhancedResult(params: {
  category: string;
  items: ContentItem[];
  keywordResult: AssessmentResult;
  skepticResult: SkepticReviewResult | null;
  evidenceFor: EvidenceItem[];
  evidenceAgainst: EvidenceItem[];
}): EnhancedAssessment {
  const { category, items, keywordResult, skepticResult, evidenceFor, evidenceAgainst } = params;

  const howWeCouldBeWrong =
    skepticResult?.howWeCouldBeWrong ??
    generateKeywordCounterEvidence(keywordResult.status, category);

  const { confidence: dataCoverage, factors } = calculateDataCoverage(
    items,
    keywordResult,
    skepticResult?.aiResult.status,
  );

  const consensusNote = skepticResult
    ? buildConsensusNote(skepticResult, keywordResult.status)
    : undefined;

  const finalStatus =
    skepticResult?.decision.downgradeApplied && skepticResult.recommendedStatus
      ? skepticResult.recommendedStatus
      : keywordResult.status;

  return {
    category,
    status: finalStatus,
    reason: skepticResult?.aiResult.reasoning || keywordResult.reason,
    matches: keywordResult.matches,
    dataCoverage,
    dataCoverageFactors: factors as unknown as Record<string, number>,
    evidenceFor: evidenceFor.slice(0, 5),
    evidenceAgainst: evidenceAgainst.slice(0, 5),
    howWeCouldBeWrong: howWeCouldBeWrong.slice(0, 5),
    keywordResult,
    aiResult: skepticResult?.aiResult,
    consensusNote,
    assessedAt: new Date().toISOString(),
    recommendedStatus: skepticResult?.recommendedStatus,
    downgradeApplied: skepticResult?.decision.downgradeApplied,
    flaggedForReview: skepticResult?.decision.flaggedForReview,
    keywordReview: skepticResult?.keywordReview,
    whatWouldChangeMind: skepticResult?.whatWouldChangeMind,
  };
}

export async function enhancedAssessment(
  items: ContentItem[],
  category: string,
  options?: { providers?: string[]; skipCache?: boolean },
): Promise<EnhancedAssessment> {
  const keywordResult = analyzeContent(items, category);
  const { evidenceFor, evidenceAgainst } = categorizeEvidence(items, keywordResult.status);
  const cacheKey = `ai-skeptic:${category}:${keywordResult.status}:${items.length}`;

  if (!options?.skipCache) {
    const cached = await cacheGet<EnhancedAssessment>(cacheKey);
    if (cached) return cached;
  }

  const skepticResult = await trySkepticReview(items, category, keywordResult, options);

  if (skepticResult) {
    mergeSkepticEvidence(evidenceFor, evidenceAgainst, skepticResult);
  }

  const result = buildEnhancedResult({
    category,
    items,
    keywordResult,
    skepticResult,
    evidenceFor,
    evidenceAgainst,
  });

  if (result.flaggedForReview) {
    flagForReview(result).catch((err) => console.error('Failed to flag for review:', err));
  }

  await cacheSet(cacheKey, result, AI_CACHE_TTL_S);
  return result;
}

async function trySkepticReview(
  items: ContentItem[],
  category: string,
  keywordResult: AssessmentResult,
  options?: { providers?: string[] },
): Promise<SkepticReviewResult | null> {
  const availableProviders = getAvailableProviders();
  const requestedProviders = options?.providers || ['anthropic', 'openai'];
  const providerToUse = availableProviders.find((p) => requestedProviders.includes(p.name));
  if (!providerToUse) return null;

  const categoryDef = CATEGORIES.find((c) => c.key === category);
  const categoryTitle = categoryDef?.title || category;
  const enrichedItems = await enrichWithRAG(items, categoryTitle, keywordResult.reason, category);

  return runSkepticReview(
    providerToUse,
    category,
    categoryTitle,
    enrichedItems,
    keywordResult,
    items,
  );
}

// ---------------------------------------------------------------------------
// Extracted helpers
// ---------------------------------------------------------------------------

async function enrichWithRAG(
  items: ContentItem[],
  categoryTitle: string,
  keywordReason: string,
  category: string,
): Promise<ContentItem[]> {
  try {
    const retrieved = await retrieveRelevantDocuments(
      `${categoryTitle}: ${keywordReason}`,
      [category, 'intent'],
      8,
    );
    if (retrieved.length === 0) return items;

    // Enrich existing items by matching URL
    const enrichedItems = items.map((item) => {
      if (item.summary) return item;
      const match = retrieved.find((r) => r.url && r.url === item.link);
      if (match?.content) return { ...item, summary: match.content };
      return item;
    });

    // Append high-similarity docs not already in items
    const existingUrls = new Set(items.map((i) => i.link).filter(Boolean));
    for (const doc of retrieved) {
      if (doc.similarity > 0.5 && doc.url && !existingUrls.has(doc.url)) {
        enrichedItems.push({
          title: doc.title,
          summary: doc.content || undefined,
          link: doc.url,
          pubDate: doc.publishedAt?.toISOString(),
        });
      }
    }

    return enrichedItems;
  } catch (err) {
    console.warn('RAG enrichment failed, continuing with original items:', err);
    return items;
  }
}

async function runSkepticReview(
  provider: AIProvider,
  category: string,
  categoryTitle: string,
  enrichedItems: ContentItem[],
  keywordResult: AssessmentResult,
  originalItems: ContentItem[],
): Promise<SkepticReviewResult | null> {
  try {
    const matchContexts = buildKeywordMatchContexts(keywordResult.matches, category, originalItems);

    const prompt = buildSkepticReviewPrompt(
      category,
      categoryTitle,
      enrichedItems.slice(0, 20),
      keywordResult.status,
      keywordResult.reason,
      matchContexts,
    );

    const completion = await provider.complete(prompt, {
      systemPrompt: SKEPTIC_REVIEW_SYSTEM_PROMPT,
      maxTokens: 1024,
      temperature: 0.3,
    });

    const parsed = parseSkepticReviewResponse(completion.content);
    if (!parsed) return null;

    const clampedStatus = clampToCeiling(keywordResult.status, parsed.recommendedStatus);
    const decision = resolveDowngrade(keywordResult.status, clampedStatus, parsed.confidence);

    return {
      aiResult: {
        provider: provider.name,
        model: completion.model,
        status: clampedStatus,
        reasoning:
          parsed.downgradeReason || `Agrees with keyword assessment: ${keywordResult.status}`,
        confidence: parsed.confidence,
        tokensUsed: completion.tokensUsed,
        latencyMs: completion.latencyMs,
      },
      decision,
      recommendedStatus: clampedStatus,
      keywordReview: parsed.keywordReview,
      whatWouldChangeMind: parsed.whatWouldChangeMind,
      howWeCouldBeWrong: parsed.howWeCouldBeWrong,
      additionalEvidenceFor: parsed.evidenceFor.map((text) => ({
        text,
        direction: 'concerning' as const,
      })),
      additionalEvidenceAgainst: parsed.evidenceAgainst.map((text) => ({
        text,
        direction: 'reassuring' as const,
      })),
    };
  } catch (err) {
    console.error(`AI assessment failed for ${category}:`, err);
    return null;
  }
}

function buildConsensusNote(
  skepticResult: SkepticReviewResult,
  keywordStatus: StatusLevel,
): string {
  const provider = skepticResult.aiResult.provider;
  if (skepticResult.decision.downgradeApplied) {
    return `AI (${provider}) reviewed keyword alert and auto-downgraded from ${keywordStatus} to ${skepticResult.recommendedStatus}`;
  }
  if (skepticResult.decision.flaggedForReview) {
    return `AI (${provider}) disagrees with ${keywordStatus} (recommends ${skepticResult.recommendedStatus}), flagged for human review`;
  }
  return `AI (${provider}) agrees with keyword assessment: ${keywordStatus}`;
}
