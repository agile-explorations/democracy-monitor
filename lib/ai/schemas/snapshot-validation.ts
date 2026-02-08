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
