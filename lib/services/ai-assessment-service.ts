import type { StatusLevel, AssessmentResult } from '@/lib/types';
import { analyzeContent } from './assessment-service';
import { calculateDataCoverage } from './confidence-scoring';
import { categorizeEvidence, type EvidenceItem } from './evidence-balance';
import { getProvider, getAvailableProviders } from '@/lib/ai/provider';
import { buildAssessmentPrompt, ASSESSMENT_SYSTEM_PROMPT } from '@/lib/ai/prompts/assessment';
import { buildCounterEvidencePrompt, COUNTER_EVIDENCE_SYSTEM_PROMPT } from '@/lib/ai/prompts/counter-evidence';
import { parseAIAssessmentResponse, parseCounterEvidenceResponse, type AIAssessmentResponse } from '@/lib/ai/schemas/assessment-response';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CATEGORIES } from '@/lib/data/categories';

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
}

export async function enhancedAssessment(
  items: any[],
  category: string,
  options?: { providers?: string[]; skipCache?: boolean }
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
  const providerToUse = availableProviders.find(p => requestedProviders.includes(p.name));

  if (providerToUse) {
    const categoryDef = CATEGORIES.find(c => c.key === category);
    const categoryTitle = categoryDef?.title || category;

    try {
      const prompt = buildAssessmentPrompt(
        category,
        categoryTitle,
        items.slice(0, 20),
        keywordResult.status,
        keywordResult.reason
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
            if (!evidenceFor.some(ef => ef.text === e)) {
              evidenceFor.push({ text: e, direction: 'concerning' });
            }
          }
        }
        if (parsed.evidenceAgainst.length > 0) {
          for (const e of parsed.evidenceAgainst) {
            if (!evidenceAgainst.some(ea => ea.text === e)) {
              evidenceAgainst.push({ text: e, direction: 'reassuring' });
            }
          }
        }
      }
    } catch (err) {
      console.error(`AI assessment failed for ${category}:`, err);
    }

    // Step 3b: Get counter-evidence for Drift/Capture if we don't have enough
    if (howWeCouldBeWrong.length < 2 && (keywordResult.status === 'Drift' || keywordResult.status === 'Capture')) {
      try {
        const counterPrompt = buildCounterEvidencePrompt(
          CATEGORIES.find(c => c.key === category)?.title || category,
          keywordResult.status,
          keywordResult.reason,
          keywordResult.matches
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
      } catch {
        // Counter-evidence is optional; continue without it
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
    aiResult?.status
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
