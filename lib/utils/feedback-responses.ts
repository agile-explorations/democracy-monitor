/**
 * Shared helper to attach feedback responses to feedback rows.
 * Used by both public and admin feedback API routes.
 */

import { desc, eq, inArray } from 'drizzle-orm';
import type { getDb } from '@/lib/db';
import { feedbackResponses } from '@/lib/db/schema';

export async function attachResponses<T extends { id: number }>(
  db: ReturnType<typeof getDb>,
  rows: T[],
): Promise<(T & { responses: { id: number; message: string; createdAt: Date }[] })[]> {
  const feedbackIds = rows.map((r) => r.id);
  if (feedbackIds.length === 0) return rows.map((r) => ({ ...r, responses: [] }));

  const responses = await db
    .select({
      id: feedbackResponses.id,
      feedbackId: feedbackResponses.feedbackId,
      message: feedbackResponses.message,
      createdAt: feedbackResponses.createdAt,
    })
    .from(feedbackResponses)
    .where(
      feedbackIds.length === 1
        ? eq(feedbackResponses.feedbackId, feedbackIds[0])
        : inArray(feedbackResponses.feedbackId, feedbackIds),
    )
    .orderBy(desc(feedbackResponses.createdAt));

  const byFeedbackId = new Map<number, { id: number; message: string; createdAt: Date }[]>();
  for (const r of responses) {
    const list = byFeedbackId.get(r.feedbackId) ?? [];
    list.push({ id: r.id, message: r.message, createdAt: r.createdAt });
    byFeedbackId.set(r.feedbackId, list);
  }

  return rows.map((row) => ({ ...row, responses: byFeedbackId.get(row.id) ?? [] }));
}
