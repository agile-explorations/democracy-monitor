import {
  buildSkepticReviewPrompt,
  SKEPTIC_REVIEW_SYSTEM_PROMPT,
} from '@/lib/ai/prompts/skeptic-review';
import type { KeywordMatchContext } from '@/lib/ai/prompts/skeptic-review';
import { getAvailableProviders } from '@/lib/ai/provider';
import { parseSkepticReviewResponse } from '@/lib/ai/schemas/assessment-response';
import { cacheGet, cacheSet } from '@/lib/cache';
import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';
import { CATEGORIES } from '@/lib/data/categories';
import type { StatusLevel, AssessmentResult, ContentItem } from '@/lib/types';
import { analyzeContent } from './assessment-service';
import { calculateDataCoverage } from './confidence-scoring';
import { retrieveRelevantDocuments } from './document-retriever';
import { categorizeEvidence } from './evidence-balance';
import type { EvidenceItem } from './evidence-balance';
import { flagForReview } from './review-queue';
import { resolveDowngrade, clampToCeiling } from './status-ordering';

const AI_CACHE_TTL_S = 6 * 60 * 60; // 6 hours

export interface EnhancedAssessment {
  category: string;
  status: StatusLevel;
  reason: string;
  matches: string[];
  dataCoverage: number;
  dataCoverageFactors?: Record<string, number>;
  evidenceFor: EvidenceItem[];
  evidenceAgainst: EvidenceItem[];
  howWeCouldBeWrong: string[];
  keywordResult: AssessmentResult;
  aiResult?: {
    provider: string;
    model: string;
    status: StatusLevel;
    reasoning: string;
    confidence: number;
    tokensUsed: { input: number; output: number };
    latencyMs: number;
  };
  consensusNote?: string;
  assessedAt: string;
  // Skeptic review fields
  recommendedStatus?: StatusLevel;
  downgradeApplied?: boolean;
  flaggedForReview?: boolean;
  keywordReview?: Array<{ keyword: string; assessment: string; reasoning: string }>;
  whatWouldChangeMind?: string;
  // Deep analysis (populated by snapshot cron for Drift/Capture)
  debate?: import('@/lib/types/debate').DebateResult;
  legalAnalysis?: import('@/lib/types/legal').LegalAnalysisResult;
  trendAnomalies?: import('@/lib/types/trends').TrendAnomaly[];
}

export async function enhancedAssessment(
  items: ContentItem[],
  category: string,
  options?: { providers?: string[]; skipCache?: boolean },
): Promise<EnhancedAssessment> {
  // Step 1: Always run keyword engine first (zero-cost baseline)
  const keywordResult = analyzeContent(items, category);

  // Step 2: Calculate evidence balance
  const { evidenceFor, evidenceAgainst } = categorizeEvidence(items, keywordResult.status);

  // Step 3: Try AI enhancement if providers are available
  let aiResult: EnhancedAssessment['aiResult'] | undefined;
  let howWeCouldBeWrong: string[] = [];
  let downgradeApplied = false;
  let flaggedForReviewResult = false;
  let recommendedStatus: StatusLevel | undefined;
  let keywordReview: EnhancedAssessment['keywordReview'] | undefined;
  let whatWouldChangeMind: string | undefined;

  const cacheKey = `ai-skeptic:${category}:${keywordResult.status}:${items.length}`;

  // Check cache first
  if (!options?.skipCache) {
    const cached = await cacheGet<EnhancedAssessment>(cacheKey);
    if (cached) return cached;
  }

  const availableProviders = getAvailableProviders();
  const requestedProviders = options?.providers || ['anthropic', 'openai'];
  const providerToUse = availableProviders.find((p) => requestedProviders.includes(p.name));

  if (providerToUse) {
    const categoryDef = CATEGORIES.find((c) => c.key === category);
    const categoryTitle = categoryDef?.title || category;

    // Enrich items with RAG-retrieved content
    let enrichedItems = items;
    try {
      const retrieved = await retrieveRelevantDocuments(
        `${categoryTitle}: ${keywordResult.reason}`,
        [category, 'intent'],
        8,
      );

      if (retrieved.length > 0) {
        // Enrich existing items by matching URL
        enrichedItems = items.map((item) => {
          if (item.summary) return item;
          const match = retrieved.find((r) => r.url && r.url === item.link);
          if (match?.content) return { ...item, summary: match.content };
          return item;
        });

        // Append high-similarity docs not already in items as additional context
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
      }
    } catch (err) {
      console.warn('RAG enrichment failed, continuing with original items:', err);
    }

    try {
      // Build keyword match context for the skeptic reviewer
      const matchContexts = buildKeywordMatchContexts(keywordResult.matches, category, items);

      const prompt = buildSkepticReviewPrompt(
        category,
        categoryTitle,
        enrichedItems.slice(0, 20),
        keywordResult.status,
        keywordResult.reason,
        matchContexts,
      );

      const completion = await providerToUse.complete(prompt, {
        systemPrompt: SKEPTIC_REVIEW_SYSTEM_PROMPT,
        maxTokens: 1024,
        temperature: 0.3,
      });

      const parsed = parseSkepticReviewResponse(completion.content);

      if (parsed) {
        // Clamp AI's recommendation to keyword ceiling
        const clampedStatus = clampToCeiling(keywordResult.status, parsed.recommendedStatus);

        // Resolve downgrade decision
        const decision = resolveDowngrade(keywordResult.status, clampedStatus, parsed.confidence);

        aiResult = {
          provider: providerToUse.name,
          model: completion.model,
          status: clampedStatus,
          reasoning:
            parsed.downgradeReason || `Agrees with keyword assessment: ${keywordResult.status}`,
          confidence: parsed.confidence,
          tokensUsed: completion.tokensUsed,
          latencyMs: completion.latencyMs,
        };

        downgradeApplied = decision.downgradeApplied;
        flaggedForReviewResult = decision.flaggedForReview;
        recommendedStatus = clampedStatus;
        keywordReview = parsed.keywordReview;
        whatWouldChangeMind = parsed.whatWouldChangeMind;
        howWeCouldBeWrong = parsed.howWeCouldBeWrong;

        // Merge AI evidence with keyword evidence
        for (const e of parsed.evidenceFor) {
          if (!evidenceFor.some((ef) => ef.text === e)) {
            evidenceFor.push({ text: e, direction: 'concerning' });
          }
        }
        for (const e of parsed.evidenceAgainst) {
          if (!evidenceAgainst.some((ea) => ea.text === e)) {
            evidenceAgainst.push({ text: e, direction: 'reassuring' });
          }
        }
      }
    } catch (err) {
      console.error(`AI assessment failed for ${category}:`, err);
    }
  }

  // If no AI was used, provide keyword-only counter-evidence
  if (howWeCouldBeWrong.length === 0) {
    howWeCouldBeWrong = generateKeywordCounterEvidence(keywordResult.status, category);
  }

  // Step 4: Calculate data coverage
  const { confidence: dataCoverage, factors } = calculateDataCoverage(
    items,
    keywordResult,
    aiResult?.status,
  );

  // Step 5: Generate consensus note
  let consensusNote: string | undefined;
  if (aiResult) {
    if (downgradeApplied) {
      consensusNote = `AI (${aiResult.provider}) reviewed keyword alert and auto-downgraded from ${keywordResult.status} to ${recommendedStatus}`;
    } else if (flaggedForReviewResult) {
      consensusNote = `AI (${aiResult.provider}) disagrees with ${keywordResult.status} (recommends ${recommendedStatus}), flagged for human review`;
    } else {
      consensusNote = `AI (${aiResult.provider}) agrees with keyword assessment: ${keywordResult.status}`;
    }
  }

  // Step 6: Determine final status
  let finalStatus = keywordResult.status;
  if (downgradeApplied && recommendedStatus) {
    finalStatus = recommendedStatus;
  }

  const result: EnhancedAssessment = {
    category,
    status: finalStatus,
    reason: aiResult?.reasoning || keywordResult.reason,
    matches: keywordResult.matches,
    dataCoverage,
    dataCoverageFactors: factors as unknown as Record<string, number>,
    evidenceFor: evidenceFor.slice(0, 5),
    evidenceAgainst: evidenceAgainst.slice(0, 5),
    howWeCouldBeWrong: howWeCouldBeWrong.slice(0, 5),
    keywordResult,
    aiResult,
    consensusNote,
    assessedAt: new Date().toISOString(),
    recommendedStatus,
    downgradeApplied,
    flaggedForReview: flaggedForReviewResult,
    keywordReview,
    whatWouldChangeMind,
  };

  // Flag for human review if needed
  if (result.flaggedForReview) {
    flagForReview(result).catch((err) => console.error('Failed to flag for review:', err));
  }

  // Cache the result
  await cacheSet(cacheKey, result, AI_CACHE_TTL_S);

  return result;
}

/**
 * Build KeywordMatchContext[] from keyword result matches.
 * Classifies each match into a tier and finds which item it appeared in.
 */
function buildKeywordMatchContexts(
  matches: string[],
  category: string,
  items: ContentItem[],
): KeywordMatchContext[] {
  return matches.map((match) => ({
    keyword: match,
    tier: classifyMatchTier(match, category),
    matchedIn: findMatchSource(match, items),
  }));
}

/** Look up which tier a keyword belongs to in ASSESSMENT_RULES. */
function classifyMatchTier(match: string, category: string): 'capture' | 'drift' | 'warning' {
  const rules = ASSESSMENT_RULES[category];
  if (!rules?.keywords) return 'warning';

  // Strip annotations like "(authoritative source)" or "(systematic pattern)"
  const cleanMatch = match
    .replace(/\s*\(.*\)\s*$/, '')
    .trim()
    .toLowerCase();

  if (rules.keywords.capture.some((k) => cleanMatch === k.toLowerCase())) return 'capture';
  if (rules.keywords.drift.some((k) => cleanMatch === k.toLowerCase())) return 'drift';
  if (rules.keywords.warning.some((k) => cleanMatch === k.toLowerCase())) return 'warning';

  // Matches with annotations (e.g. "keyword (systematic pattern)") are elevated
  if (match.includes('(systematic pattern)')) return 'capture';
  if (match.includes('(authoritative source)')) return 'capture';

  return 'warning';
}

/** Find which item title/summary contained a given keyword match. */
function findMatchSource(match: string, items: ContentItem[]): string {
  const cleanMatch = match
    .replace(/\s*\(.*\)\s*$/, '')
    .trim()
    .toLowerCase();

  for (const item of items) {
    const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
    if (text.includes(cleanMatch)) {
      return item.title || '(untitled)';
    }
  }

  return '(source not identified)';
}

function generateKeywordCounterEvidence(status: StatusLevel, _category: string): string[] {
  switch (status) {
    case 'Capture':
      return [
        'Keyword matching may trigger on document titles that discuss violations without indicating current violations',
        'Court-related keywords may reflect ongoing litigation rather than actual defiance',
        'High-authority source matches may be from historical or analytical reports rather than new findings',
      ];
    case 'Drift':
      return [
        'Multiple keyword matches may reflect increased reporting rather than increased violations',
        'Regulatory activity patterns may be within normal variation for this time period',
      ];
    case 'Warning':
      return [
        'Warning-level keywords often appear in routine government documents',
        'A single drift keyword match may be coincidental rather than indicative of a pattern',
      ];
    case 'Stable':
      return [
        'Absence of keyword matches does not guarantee absence of concerning activity',
        'Some forms of power consolidation may not generate detectable keywords',
      ];
  }
}
