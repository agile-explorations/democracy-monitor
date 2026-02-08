import { desc } from 'drizzle-orm';
import { IntentAssessmentSchema } from '@/lib/ai/schemas/snapshot-validation';
import { getDb } from '@/lib/db';
import { intentAssessments } from '@/lib/db/schema';
import type { IntentAssessment } from '@/lib/types/intent';

/**
 * Save an intent assessment snapshot to the database.
 */
export async function saveIntentSnapshot(
  assessment: IntentAssessment,
  assessedAt?: Date,
): Promise<void> {
  const db = getDb();
  await db.insert(intentAssessments).values({
    overall: assessment.overall,
    confidence: assessment.confidence,
    rhetoricScore: assessment.rhetoricScore,
    actionScore: assessment.actionScore,
    gap: assessment.gap,
    detail: assessment as unknown as Record<string, unknown>,
    assessedAt: assessedAt || new Date(),
  });
}

/**
 * Get the most recent intent assessment snapshot from the database.
 */
export async function getLatestIntentSnapshot(): Promise<IntentAssessment | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(intentAssessments)
    .orderBy(desc(intentAssessments.assessedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  // The full IntentAssessment is stored in the detail column
  if (row.detail && typeof row.detail === 'object' && 'overall' in row.detail) {
    const parsed = IntentAssessmentSchema.safeParse(row.detail);
    if (parsed.success) {
      const assessment = parsed.data as unknown as IntentAssessment;
      assessment.assessedAt = new Date(row.assessedAt).toISOString();
      return assessment;
    }
    console.warn('Intent snapshot JSONB validation failed:', parsed.error.message);
  }

  // Fallback: reconstruct from columns
  return {
    overall: row.overall as IntentAssessment['overall'],
    confidence: row.confidence ?? 0,
    rhetoricScore: row.rhetoricScore,
    actionScore: row.actionScore,
    gap: row.gap,
    policyAreas: {} as IntentAssessment['policyAreas'],
    recentStatements: [],
    assessedAt: new Date(row.assessedAt).toISOString(),
  };
}
