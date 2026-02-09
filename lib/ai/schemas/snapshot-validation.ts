import { z } from 'zod';

/** Validates the JSONB blob stored in assessments.detail */
export const EnhancedAssessmentSchema = z
  .object({
    category: z.string(),
    status: z.enum(['Stable', 'Warning', 'Drift', 'Capture']),
    reason: z.string(),
    matches: z.array(z.string()),
    dataCoverage: z.number(),
    evidenceFor: z.array(z.object({ text: z.string(), direction: z.string() })),
    evidenceAgainst: z.array(z.object({ text: z.string(), direction: z.string() })),
    howWeCouldBeWrong: z.array(z.string()),
    keywordResult: z.object({
      status: z.enum(['Stable', 'Warning', 'Drift', 'Capture']),
      reason: z.string(),
      matches: z.array(z.string()),
    }),
    assessedAt: z.string(),
    // Skeptic review fields (Sprint 3)
    recommendedStatus: z.enum(['Stable', 'Warning', 'Drift', 'Capture']).optional(),
    downgradeApplied: z.boolean().optional(),
    flaggedForReview: z.boolean().optional(),
    keywordReview: z
      .array(
        z.object({
          keyword: z.string(),
          assessment: z.string(),
          reasoning: z.string(),
        }),
      )
      .optional(),
    whatWouldChangeMind: z.string().optional(),
  })
  .passthrough();

/** Validates the JSONB blob stored in intent_assessments.detail */
export const IntentAssessmentSchema = z
  .object({
    overall: z.string(),
    confidence: z.number(),
    rhetoricScore: z.number(),
    actionScore: z.number(),
    gap: z.number(),
    policyAreas: z.record(z.string(), z.unknown()),
    recentStatements: z.array(z.unknown()),
    assessedAt: z.string(),
  })
  .passthrough();
