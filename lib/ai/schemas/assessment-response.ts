import { z } from 'zod';
import { extractJsonFromLlm } from '@/lib/utils/ai-helpers';

export const AIAssessmentResponseSchema = z.object({
  status: z.enum(['Stable', 'Warning', 'Drift', 'Capture']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  evidenceFor: z.array(z.string()),
  evidenceAgainst: z.array(z.string()),
  howWeCouldBeWrong: z.array(z.string()),
});

export type AIAssessmentResponse = z.infer<typeof AIAssessmentResponseSchema>;

export const CounterEvidenceResponseSchema = z.object({
  counterPoints: z.array(z.string()),
});

export type CounterEvidenceResponse = z.infer<typeof CounterEvidenceResponseSchema>;

export function parseAIAssessmentResponse(raw: string): AIAssessmentResponse | null {
  const parsed = extractJsonFromLlm(raw);
  if (!parsed) return null;
  const result = AIAssessmentResponseSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function parseCounterEvidenceResponse(raw: string): CounterEvidenceResponse | null {
  const parsed = extractJsonFromLlm(raw);
  if (!parsed) return null;
  const result = CounterEvidenceResponseSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export const SkepticReviewResponseSchema = z.object({
  keywordReview: z.array(
    z.object({
      keyword: z.string(),
      assessment: z.enum(['genuine_concern', 'false_positive', 'ambiguous']),
      reasoning: z.string(),
    }),
  ),
  recommendedStatus: z.enum(['Stable', 'Warning', 'Drift', 'Capture']),
  downgradeReason: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceFor: z.array(z.string()),
  evidenceAgainst: z.array(z.string()).min(1),
  howWeCouldBeWrong: z.array(z.string()).min(2),
  whatWouldChangeMind: z.string(),
});

export type SkepticReviewResponse = z.infer<typeof SkepticReviewResponseSchema>;

export function parseSkepticReviewResponse(raw: string): SkepticReviewResponse | null {
  const parsed = extractJsonFromLlm(raw);
  if (!parsed) return null;
  const result = SkepticReviewResponseSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
