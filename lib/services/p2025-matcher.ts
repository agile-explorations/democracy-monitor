import { buildP2025JudgePrompt, P2025_JUDGE_SYSTEM_PROMPT } from '@/lib/ai/prompts/p2025-judge';
import { getAvailableProviders } from '@/lib/ai/provider';
import type { P2025Classification } from '@/lib/types/p2025';

const LLM_JUDGE_MAX_TOKENS = 500;
const LLM_JUDGE_TEMPERATURE = 0.1;

const VALID_CLASSIFICATIONS: P2025Classification[] = [
  'not_related',
  'loosely_related',
  'implements',
  'exceeds',
];

export interface JudgeResult {
  classification: P2025Classification;
  confidence: number;
  reasoning: string;
}

/**
 * Parse the LLM judge response, handling malformed JSON gracefully.
 */
export function parseJudgeResponse(text: string): JudgeResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        classification: 'not_related',
        confidence: 0,
        reasoning: 'Failed to parse response',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const classification = VALID_CLASSIFICATIONS.includes(parsed.classification)
      ? parsed.classification
      : 'not_related';

    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;

    const reasoning =
      typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided';

    return { classification, confidence, reasoning };
  } catch (err) {
    console.warn('Failed to parse judge response:', err);
    return { classification: 'not_related', confidence: 0, reasoning: 'Failed to parse response' };
  }
}
