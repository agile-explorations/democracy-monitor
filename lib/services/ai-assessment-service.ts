import { buildAssessmentPrompt, ASSESSMENT_SYSTEM_PROMPT } from '@/lib/ai/prompts/assessment';
import {
  buildCounterEvidencePrompt,
  COUNTER_EVIDENCE_SYSTEM_PROMPT,
} from '@/lib/ai/prompts/counter-evidence';
import { getProvider, getAvailableProviders } from '@/lib/ai/provider';
import {
  parseAIAssessmentResponse,
  parseCounterEvidenceResponse,
} from '@/lib/ai/schemas/assessment-response';
import type { AIAssessmentResponse } from '@/lib/ai/schemas/assessment-response';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CATEGORIES } from '@/lib/data/categories';
import type { StatusLevel, AssessmentResult, ContentItem } from '@/lib/types';
import { analyzeContent } from './assessment-service';
import { calculateDataCoverage } from './confidence-scoring';
import { retrieveRelevantDocuments } from './document-retriever';
import { categorizeEvidence } from './evidence-balance';
import type { EvidenceItem } from './evidence-balance';

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

  const cacheKey = `ai-assess:${category}:${keywordResult.status}:${items.length}`;

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
      const prompt = buildAssessmentPrompt(
        category,
        categoryTitle,
        enrichedItems.slice(0, 20),
        keywordResult.status,
        keywordResult.reason,
      );

      const completion = await providerToUse.complete(prompt, {
        systemPrompt: ASSESSMENT_SYSTEM_PROMPT,
        maxTokens: 1024,
        temperature: 0.3,
      });

      const parsed = parseAIAssessmentResponse(completion.content);

      if (parsed) {
        aiResult = {
          provider: providerToUse.name,
          model: completion.model,
          status: parsed.status,
          reasoning: parsed.reasoning,
          confidence: parsed.confidence,
          tokensUsed: completion.tokensUsed,
          latencyMs: completion.latencyMs,
        };

        howWeCouldBeWrong = parsed.howWeCouldBeWrong;

        // Merge AI evidence with keyword evidence
        if (parsed.evidenceFor.length > 0) {
          for (const e of parsed.evidenceFor) {
            if (!evidenceFor.some((ef) => ef.text === e)) {
              evidenceFor.push({ text: e, direction: 'concerning' });
            }
          }
        }
        if (parsed.evidenceAgainst.length > 0) {
          for (const e of parsed.evidenceAgainst) {
            if (!evidenceAgainst.some((ea) => ea.text === e)) {
              evidenceAgainst.push({ text: e, direction: 'reassuring' });
            }
          }
        }
      }
    } catch (err) {
      console.error(`AI assessment failed for ${category}:`, err);
    }

    // Step 3b: Get counter-evidence for Drift/Capture if we don't have enough
    if (
      howWeCouldBeWrong.length < 2 &&
      (keywordResult.status === 'Drift' || keywordResult.status === 'Capture')
    ) {
      try {
        // Enrich evidence with retrieved document summaries
        const enrichedMatches = [...keywordResult.matches];
        const extraItems = enrichedItems.filter((i) => i.summary && !i.isError && !i.isWarning);
        for (const item of extraItems.slice(0, 5)) {
          const context = `${item.title}: ${item.summary!.slice(0, 200)}`;
          if (!enrichedMatches.includes(context)) {
            enrichedMatches.push(context);
          }
        }

        const counterPrompt = buildCounterEvidencePrompt(
          CATEGORIES.find((c) => c.key === category)?.title || category,
          keywordResult.status,
          keywordResult.reason,
          enrichedMatches,
        );

        const counterCompletion = await providerToUse.complete(counterPrompt, {
          systemPrompt: COUNTER_EVIDENCE_SYSTEM_PROMPT,
          maxTokens: 512,
          temperature: 0.5,
        });

        const counterParsed = parseCounterEvidenceResponse(counterCompletion.content);
        if (counterParsed) {
          howWeCouldBeWrong = counterParsed.counterPoints;
        }
      } catch (err) {
        console.warn('Counter-evidence retrieval failed:', err);
      }
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
    if (aiResult.status === keywordResult.status) {
      consensusNote = `Both keyword analysis and AI (${aiResult.provider}) agree: ${keywordResult.status}`;
    } else {
      consensusNote = `Keyword analysis says ${keywordResult.status}, AI (${aiResult.provider}) says ${aiResult.status}. Using keyword result as baseline.`;
    }
  }

  // Step 6: Determine final status (keyword engine is authoritative)
  const finalStatus = keywordResult.status;

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
  };

  // Cache the result
  await cacheSet(cacheKey, result, AI_CACHE_TTL_S);

  return result;
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
