import fs from 'fs';
import { z } from 'zod';

const StatusLevelSchema = z.enum(['Stable', 'Warning', 'Drift', 'Capture']);

export const ReviewFeedbackSchema = z.object({
  falsePositiveKeywords: z.array(z.string()).optional(),
  missingKeywords: z.array(z.string()).optional(),
  suppressionSuggestions: z.array(z.string()).optional(),
  tierChanges: z
    .array(
      z.object({
        keyword: z.string(),
        currentTier: z.string(),
        suggestedTier: z.string(),
        reason: z.string().optional(),
      }),
    )
    .optional(),
});

export type ReviewFeedback = z.infer<typeof ReviewFeedbackSchema>;

export const ReviewDecisionSchema = z
  .object({
    id: z.string(),
    decision: z.enum(['approve', 'override', 'skip']),
    finalStatus: StatusLevelSchema.optional(),
    reasoning: z.string().optional(),
    reviewer: z.string().optional(),
    feedback: ReviewFeedbackSchema.optional(),
  })
  .refine((d) => d.decision !== 'override' || d.finalStatus !== undefined, {
    message: 'finalStatus is required when decision is "override"',
  });

export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const ReviewDecisionsFileSchema = z.object({
  metadata: z.object({
    generatedAt: z.string(),
    totalItems: z.number(),
  }),
  decisions: z.array(ReviewDecisionSchema),
});

export type ReviewDecisionsFile = z.infer<typeof ReviewDecisionsFileSchema>;

export function loadDecisions(filePath: string): ReviewDecisionsFile {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return ReviewDecisionsFileSchema.parse(parsed);
}

export function validateDecisionsComplete(decisions: ReviewDecision[]): string[] {
  return decisions.filter((d) => d.decision === 'skip').map((d) => d.id);
}
