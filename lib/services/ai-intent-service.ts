import {
  buildIntentClassificationPrompt,
  INTENT_SYSTEM_PROMPT,
} from '@/lib/ai/prompts/intent-classification';
import { getAvailableProviders } from '@/lib/ai/provider';
import { parseAIIntentResponse } from '@/lib/ai/schemas/intent-response';
import { cacheGet, cacheSet } from '@/lib/cache';
import { AI_CACHE_TTL_S } from '@/lib/data/cache-config';
import type { IntentAssessment, IntentStatement } from '@/lib/types/intent';
import { selectProvider } from '@/lib/utils/ai-helpers';
import { retrieveRelevantDocuments } from './document-retriever';
import { scoreStatements } from './intent-service';

function buildIntentResult(
  keywordResult: IntentAssessment,
  parsed: { overall: string; reasoning: string },
  providerName: string,
  model: string,
): IntentAssessment {
  let consensusNote: string;
  if (parsed.overall === keywordResult.overall) {
    consensusNote = `Both keyword analysis and AI (${providerName}) agree: ${keywordResult.overall}`;
  } else {
    consensusNote = `Keyword analysis says ${keywordResult.overall}, AI (${providerName}) says ${parsed.overall}. Using keyword result as baseline.`;
  }

  return {
    ...keywordResult,
    aiReasoning: parsed.reasoning,
    aiOverall: parsed.overall as IntentAssessment['aiOverall'],
    aiProvider: providerName,
    aiModel: model,
    consensusNote,
  };
}

async function retrieveIntentDocs(
  statements: IntentStatement[],
): Promise<Awaited<ReturnType<typeof retrieveRelevantDocuments>>> {
  try {
    const query = statements
      .slice(0, 5)
      .map((s) => s.text)
      .join(' ');
    return await retrieveRelevantDocuments(query, 'intent', 5);
  } catch (err) {
    console.warn('RAG retrieval for intent failed:', err);
    return [];
  }
}

export async function enhancedIntentAssessment(
  statements: IntentStatement[],
  options?: { skipCache?: boolean },
): Promise<IntentAssessment> {
  const keywordResult = scoreStatements(statements);
  const cacheKey = `ai-intent:${keywordResult.overall}:${statements.length}`;

  if (!options?.skipCache) {
    const cached = await cacheGet<IntentAssessment>(cacheKey);
    if (cached) return cached;
  }

  const providerToUse = selectProvider(getAvailableProviders());
  if (!providerToUse) {
    await cacheSet(cacheKey, keywordResult, AI_CACHE_TTL_S);
    return keywordResult;
  }

  const retrievedDocs = await retrieveIntentDocs(statements);

  try {
    const promptStatements = statements.slice(0, 15).map((s) => ({
      text: s.text,
      source: s.source,
      date: s.date,
    }));
    const prompt = buildIntentClassificationPrompt(
      promptStatements,
      retrievedDocs.length > 0 ? retrievedDocs : undefined,
    );
    const completion = await providerToUse.complete(prompt, {
      systemPrompt: INTENT_SYSTEM_PROMPT,
      maxTokens: 1024,
      temperature: 0.3,
    });
    const parsed = parseAIIntentResponse(completion.content);
    if (parsed) {
      const result = buildIntentResult(keywordResult, parsed, providerToUse.name, completion.model);
      await cacheSet(cacheKey, result, AI_CACHE_TTL_S);
      return result;
    }
  } catch (err) {
    console.error('AI intent assessment failed:', err);
  }

  await cacheSet(cacheKey, keywordResult, AI_CACHE_TTL_S);
  return keywordResult;
}
