import { z } from 'zod';
import { extractJsonFromLlm } from '@/lib/utils/ai-helpers';

export const ErosionTypeSchema = z.enum([
  'formal_override',
  'operational_hollowing',
  'noncompliance_refusal',
  'routine',
  'unclear',
]);

export type ErosionType = z.infer<typeof ErosionTypeSchema>;

export const Pass1ResponseSchema = z.object({
  relevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
  erosionType: ErosionTypeSchema,
});

export type Pass1Response = z.infer<typeof Pass1ResponseSchema>;

export const Pass2AssessmentSchema = z.enum([
  'routine',
  'novel_not_concerning',
  'potentially_concerning',
  'clearly_concerning',
]);

export type Pass2Assessment = z.infer<typeof Pass2AssessmentSchema>;

export const Pass2ResponseSchema = z.object({
  assessment: Pass2AssessmentSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  comparativeContext: z.string(),
  citedPassages: z.array(z.string()),
  erosionType: ErosionTypeSchema,
  counterArguments: z.array(z.string()),
});

export type Pass2Response = z.infer<typeof Pass2ResponseSchema>;

export function parsePass1Response(raw: string): Pass1Response | null {
  const parsed = extractJsonFromLlm(raw);
  if (!parsed) return null;
  const result = Pass1ResponseSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function parsePass2Response(raw: string): Pass2Response | null {
  const parsed = extractJsonFromLlm(raw);
  if (!parsed) return null;
  const result = Pass2ResponseSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
