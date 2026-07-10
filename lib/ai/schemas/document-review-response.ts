import { z } from 'zod';
import { EROSION_ACTORS } from '@/lib/types/structural';
import { extractJsonFromLlm } from '@/lib/utils/ai-helpers';

export const ErosionTypeSchema = z.enum([
  'formal_override',
  'operational_hollowing',
  'noncompliance_refusal',
  'routine',
  'unclear',
]);

export const ErosionActorSchema = z.enum(EROSION_ACTORS);

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

export const Pass2ResponseSchema = z.object({
  assessment: Pass2AssessmentSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  comparativeContext: z.string(),
  citedPassages: z.array(z.string()),
  erosionType: ErosionTypeSchema,
  // Optional by necessity, not preference: a required field would fail
  // safeParse on responses produced by the pre-attribution prompt (#537).
  erosionActor: ErosionActorSchema.optional(),
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
