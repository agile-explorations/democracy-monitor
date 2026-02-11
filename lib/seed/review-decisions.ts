import fs from 'fs';
import { z } from 'zod';

export const ReviewDecisionSchema = z
  .object({
    id: z.string(),
    decision: z.enum(['approve', 'override', 'pending']),
    overrideStatus: z.enum(['Stable', 'Warning', 'Drift', 'Capture']).optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.decision !== 'override' || d.overrideStatus !== undefined, {
    message: 'overrideStatus is required when decision is "override"',
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
  return decisions.filter((d) => d.decision === 'pending').map((d) => d.id);
}
