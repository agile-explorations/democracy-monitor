import { z } from 'zod';

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
  try {
    // Try to extract JSON from the response (AI might wrap it in markdown)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const result = AIAssessmentResponseSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseCounterEvidenceResponse(raw: string): CounterEvidenceResponse | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const result = CounterEvidenceResponseSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
