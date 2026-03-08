import type { InferInsertModel } from 'drizzle-orm';
import { EnhancedAssessmentSchema } from '@/lib/ai/schemas/snapshot-validation';
import { getDb } from '@/lib/db';
import { assessments } from '@/lib/db/schema';
import type { EnhancedAssessment } from '@/lib/types';

/**
 * Save an assessment snapshot to the database.
 */
export async function saveSnapshot(
  assessment: EnhancedAssessment,
  assessedAt?: Date,
): Promise<void> {
  const db = getDb();
  await db.insert(assessments).values(buildSnapshotRow(assessment, assessedAt));
}

export interface AssessmentRow {
  id: number;
  category: string;
  status: string;
  reason: string;
  matches: string[] | null;
  detail: Record<string, unknown> | null;
  assessed_at?: Date;
  assessedAt?: Date;
  ai_provider?: string | null;
  aiProvider?: string | null;
  confidence: number | null;
}

/**
 * Build the insert values object for a snapshot row.
 * Pure function — no DB interaction.
 */
export function buildSnapshotRow(
  assessment: EnhancedAssessment,
  assessedAt?: Date,
): InferInsertModel<typeof assessments> {
  return {
    category: assessment.category,
    status: assessment.status,
    reason: assessment.reason,
    matches: assessment.matches,
    detail: assessment as unknown as Record<string, unknown>,
    assessedAt: assessedAt || new Date(),
    aiProvider: assessment.aiResult?.provider || null,
    confidence: assessment.dataCoverage ? Math.round(assessment.dataCoverage * 100) : null,
  };
}

/**
 * Convert a DB row back to an EnhancedAssessment.
 * Exported for testability — the core reconstruction logic.
 */
export function rowToAssessment(row: AssessmentRow): EnhancedAssessment | null {
  // The full EnhancedAssessment blob is stored in the detail column
  if (row.detail && typeof row.detail === 'object' && 'category' in row.detail) {
    const parsed = EnhancedAssessmentSchema.safeParse(row.detail);
    if (parsed.success) {
      const assessment = parsed.data as unknown as EnhancedAssessment;
      // Override assessedAt with the DB timestamp
      const ts = row.assessed_at || row.assessedAt;
      if (ts) {
        assessment.assessedAt = new Date(ts as unknown as string).toISOString();
      }
      return assessment;
    }
    console.warn(`Snapshot JSONB validation failed for ${row.category}:`, parsed.error.message);
  }

  // Fallback: reconstruct from individual columns (older rows or invalid blob)
  return {
    category: row.category,
    status: row.status as EnhancedAssessment['status'],
    reason: row.reason,
    matches: row.matches || [],
    dataCoverage: row.confidence ? row.confidence / 100 : 0,
    evidenceFor: [],
    evidenceAgainst: [],
    howWeCouldBeWrong: [],
    keywordResult: {
      status: row.status as EnhancedAssessment['status'],
      reason: row.reason,
      matches: row.matches || [],
    },
    assessedAt:
      (row.assessed_at || row.assessedAt
        ? new Date((row.assessed_at || row.assessedAt) as unknown as string).toISOString()
        : null) || new Date().toISOString(),
  };
}
