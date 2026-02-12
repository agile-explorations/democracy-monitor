import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { alerts } from '@/lib/db/schema';
import type { ReviewFeedback } from '@/lib/seed/review-decisions';
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
      keywordReason: assessment.keywordResult.reason,
      keywordMatches: assessment.keywordResult.matches,
      documentCount: assessment.keywordResult.detail?.itemsReviewed,
      insufficientData: assessment.keywordResult.detail?.insufficientData,
      aiRecommendedStatus: assessment.recommendedStatus,
      aiConfidence: assessment.aiResult?.confidence,
      aiReasoning: assessment.aiResult?.reasoning,
      keywordReview: assessment.keywordReview,
      evidenceFor: assessment.evidenceFor?.slice(0, 5),
      evidenceAgainst: assessment.evidenceAgainst?.slice(0, 5),
      reviewedDocuments: assessment.reviewedDocuments,
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

export async function getResolvedReviews() {
  if (!isDbAvailable()) return [];

  const db = getDb();
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.type, 'review'), isNotNull(alerts.resolvedAt)))
    .orderBy(desc(alerts.resolvedAt));
}

export interface ResolveDecision {
  finalStatus: StatusLevel;
  reason: string;
  reviewer: string;
  decision: 'approve' | 'override' | 'skip';
  feedback?: ReviewFeedback;
}

export async function resetResolvedReviews(): Promise<number> {
  if (!isDbAvailable()) {
    throw new Error('DB unavailable — cannot reset reviews');
  }

  const db = getDb();
  const resolved = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.type, 'review'), isNotNull(alerts.resolvedAt)));

  for (const row of resolved) {
    const [existing] = await db.select().from(alerts).where(eq(alerts.id, row.id)).limit(1);
    const meta = (existing?.metadata ?? {}) as Record<string, unknown>;
    const { resolution: _, ...rest } = meta;
    await db.update(alerts).set({ resolvedAt: null, metadata: rest }).where(eq(alerts.id, row.id));
  }

  return resolved.length;
}

export async function resolveReview(alertId: number, decision: ResolveDecision): Promise<void> {
  if (!isDbAvailable()) {
    throw new Error('DB unavailable — cannot resolve review');
  }

  const db = getDb();

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
          decision: decision.decision,
          reason: decision.reason,
          reviewer: decision.reviewer,
          feedback: decision.feedback,
          resolvedAt: new Date().toISOString(),
        },
      },
    })
    .where(eq(alerts.id, alertId));
}
