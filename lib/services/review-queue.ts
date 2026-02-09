import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { alerts } from '@/lib/db/schema';
import type { StatusLevel, EnhancedAssessment } from '@/lib/types';

export async function flagForReview(assessment: EnhancedAssessment): Promise<void> {
  if (!isDbAvailable()) {
    console.warn('DB unavailable — skipping review queue insert');
    return;
  }

  const db = getDb();
  await db.insert(alerts).values({
    type: 'review',
    category: assessment.category,
    severity: assessment.keywordResult.status,
    message: `AI recommends ${assessment.recommendedStatus ?? assessment.status} vs keyword ${assessment.keywordResult.status}`,
    metadata: {
      keywordStatus: assessment.keywordResult.status,
      aiRecommendedStatus: assessment.recommendedStatus,
      aiConfidence: assessment.aiResult?.confidence,
      aiReasoning: assessment.aiResult?.reasoning,
      keywordReview: assessment.keywordReview,
      whatWouldChangeMind: assessment.whatWouldChangeMind,
      assessedAt: assessment.assessedAt,
    },
  });
}

export async function getPendingReviews() {
  if (!isDbAvailable()) return [];

  const db = getDb();
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.type, 'review'), isNull(alerts.resolvedAt)))
    .orderBy(desc(alerts.createdAt));
}

export async function resolveReview(
  alertId: number,
  decision: { finalStatus: StatusLevel; reason: string; reviewer: string },
): Promise<void> {
  if (!isDbAvailable()) {
    throw new Error('DB unavailable — cannot resolve review');
  }

  const db = getDb();

  // Fetch existing metadata to merge
  const [existing] = await db.select().from(alerts).where(eq(alerts.id, alertId)).limit(1);

  if (!existing) {
    throw new Error(`Alert ${alertId} not found`);
  }

  const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;

  await db
    .update(alerts)
    .set({
      resolvedAt: new Date(),
      metadata: {
        ...existingMeta,
        resolution: {
          finalStatus: decision.finalStatus,
          reason: decision.reason,
          reviewer: decision.reviewer,
          resolvedAt: new Date().toISOString(),
        },
      },
    })
    .where(eq(alerts.id, alertId));
}
