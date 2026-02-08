import {
  buildIntentClassificationPrompt,
  INTENT_SYSTEM_PROMPT,
} from '@/lib/ai/prompts/intent-classification';
import { getAvailableProviders } from '@/lib/ai/provider';
import { parseAIIntentResponse } from '@/lib/ai/schemas/intent-response';
import { cacheGet, cacheSet } from '@/lib/cache';
import type { IntentAssessment, IntentStatement } from '@/lib/types/intent';
import { retrieveRelevantDocuments } from './document-retriever';
import { scoreStatements } from './intent-service';

const AI_CACHE_TTL_S = 6 * 60 * 60; // 6 hours

export async function enhancedIntentAssessment(
  statements: IntentStatement[],
  options?: { skipCache?: boolean },
): Promise<IntentAssessment> {
  // Step 1: Always run keyword engine first (zero-cost baseline)
  const keywordResult = scoreStatements(statements);

  const cacheKey = `ai-intent:${keywordResult.overall}:${statements.length}`;

  // Step 2: Check cache
  if (!options?.skipCache) {
    const cached = await cacheGet<IntentAssessment>(cacheKey);
    if (cached) return cached;
  }

  // Step 3: Try AI enhancement
  const availableProviders = getAvailableProviders();
  const providerToUse = availableProviders.find(
    (p) => p.name === 'anthropic' || p.name === 'openai',
  );

  if (!providerToUse) {
    await cacheSet(cacheKey, keywordResult, AI_CACHE_TTL_S);
    return keywordResult;
  }

  // Step 4: Retrieve relevant docs from intent category
  let retrievedDocs: Awaited<ReturnType<typeof retrieveRelevantDocuments>> = [];
  try {
    const query = statements
      .slice(0, 5)
      .map((s) => s.text)
      .join(' ');
    retrievedDocs = await retrieveRelevantDocuments(query, 'intent', 5);
  } catch (err) {
    console.warn('RAG retrieval for intent failed:', err);
  }

  try {
    // Step 5: Build prompt with optional retrieved docs
    const promptStatements = statements.slice(0, 15).map((s) => ({
      text: s.text,
      source: s.source,
      date: s.date,
    }));
    const prompt = buildIntentClassificationPrompt(
      promptStatements,
      retrievedDocs.length > 0 ? retrievedDocs : undefined,
    );

    // Step 6: Call AI provider
    const completion = await providerToUse.complete(prompt, {
      systemPrompt: INTENT_SYSTEM_PROMPT,
      maxTokens: 1024,
      temperature: 0.3,
    });

    // Step 7: Parse response
    const parsed = parseAIIntentResponse(completion.content);

    if (parsed) {
      // Step 8: Merge — keyword is authoritative for `overall`, AI fields are additive
      let consensusNote: string | undefined;
      if (parsed.overall === keywordResult.overall) {
        consensusNote = `Both keyword analysis and AI (${providerToUse.name}) agree: ${keywordResult.overall}`;
      } else {
        consensusNote = `Keyword analysis says ${keywordResult.overall}, AI (${providerToUse.name}) says ${parsed.overall}. Using keyword result as baseline.`;
      }

      const result: IntentAssessment = {
        ...keywordResult,
        aiReasoning: parsed.reasoning,
        aiOverall: parsed.overall,
        aiProvider: providerToUse.name,
        aiModel: completion.model,
        consensusNote,
      };

      await cacheSet(cacheKey, result, AI_CACHE_TTL_S);
      return result;
    }
  } catch (err) {
    console.error('AI intent assessment failed:', err);
  }

  // Fallback: return keyword-only result
  await cacheSet(cacheKey, keywordResult, AI_CACHE_TTL_S);
  return keywordResult;
}
