import type { InferInsertModel } from 'drizzle-orm';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
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

/**
 * Get the most recent snapshot for a given category.
 */
export async function getLatestSnapshot(category: string): Promise<EnhancedAssessment | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(assessments)
    .where(eq(assessments.category, category))
    .orderBy(desc(assessments.assessedAt))
    .limit(1);

  if (rows.length === 0) return null;
  return rowToAssessment(rows[0] as unknown as AssessmentRow);
}

/**
 * Get the latest snapshot per category (one query with DISTINCT ON).
 */
export async function getLatestSnapshots(): Promise<Record<string, EnhancedAssessment>> {
  const db = getDb();

  // Use raw SQL for DISTINCT ON which Drizzle doesn't natively support
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (category) *
    FROM assessments
    ORDER BY category, assessed_at DESC
  `);

  const result: Record<string, EnhancedAssessment> = {};
  for (const row of rows.rows) {
    const assessment = rowToAssessment(row as unknown as AssessmentRow);
    if (assessment) {
      result[assessment.category] = assessment;
    }
  }
  return result;
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

/**
 * Get snapshot history for a single category within a date range.
 */
export async function getSnapshotHistory(
  category: string,
  options?: { from?: string; to?: string },
): Promise<EnhancedAssessment[]> {
  const db = getDb();

  const conditions = [eq(assessments.category, category)];
  if (options?.from) conditions.push(gte(assessments.assessedAt, new Date(options.from)));
  if (options?.to) conditions.push(lte(assessments.assessedAt, new Date(options.to)));

  const rows = await db
    .select()
    .from(assessments)
    .where(and(...conditions))
    .orderBy(assessments.assessedAt);

  return rows
    .map((row) => rowToAssessment(row as unknown as AssessmentRow))
    .filter((a): a is EnhancedAssessment => a !== null);
}

export interface TrajectoryPoint {
  week: string;
  status: string;
  reason: string;
  matchCount: number;
}

/**
 * Get weekly trajectory for all categories within a date range.
 * Returns one assessment per category per week (the latest in each week).
 */
export async function getWeeklyTrajectory(options?: {
  from?: string;
  to?: string;
}): Promise<Record<string, TrajectoryPoint[]>> {
  const db = getDb();

  // Use raw SQL for the date_trunc + DISTINCT ON combo
  const fromClause = options?.from ? sql`AND assessed_at >= ${new Date(options.from)}` : sql``;
  const toClause = options?.to ? sql`AND assessed_at <= ${new Date(options.to)}` : sql``;

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (category, date_trunc('week', assessed_at))
      category,
      date_trunc('week', assessed_at) AS week,
      status,
      reason,
      matches,
      assessed_at
    FROM assessments
    WHERE 1=1 ${fromClause} ${toClause}
    ORDER BY category, date_trunc('week', assessed_at), assessed_at DESC
  `);

  const result: Record<string, TrajectoryPoint[]> = {};
  for (const row of rows.rows) {
    const r = row as Record<string, unknown>;
    const cat = r.category as string;
    if (!result[cat]) result[cat] = [];
    result[cat].push({
      week: new Date(r.week as string).toISOString().split('T')[0],
      status: r.status as string,
      reason: r.reason as string,
      matchCount: Array.isArray(r.matches) ? r.matches.length : 0,
    });
  }
  return result;
}
