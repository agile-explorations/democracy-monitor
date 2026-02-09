import { z } from 'zod';
import { extractJsonFromLlm } from '@/lib/utils/ai-helpers';

export const AIIntentResponseSchema = z.object({
  overall: z.enum([
    'liberal_democracy',
    'competitive_authoritarian',
    'executive_dominant',
    'illiberal_democracy',
    'personalist_rule',
  ]),
  overallScore: z.number().min(-2).max(2),
  reasoning: z.string(),
  items: z.array(
    z.object({
      index: z.number(),
      type: z.enum(['rhetoric', 'action']),
      area: z.enum([
        'rule_of_law',
        'civil_liberties',
        'elections',
        'media_freedom',
        'institutional_independence',
      ]),
      score: z.number().min(-2).max(2),
    }),
  ),
});

export type AIIntentResponse = z.infer<typeof AIIntentResponseSchema>;

export function parseAIIntentResponse(raw: string): AIIntentResponse | null {
  const parsed = extractJsonFromLlm(raw);
  if (!parsed) return null;
  const result = AIIntentResponseSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
