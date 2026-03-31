/**
 * GET /api/admin/feedback — list feedback with emails and responses (admin only).
 */

import { desc } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
import { requireAdmin, requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { attachResponses } from '@/lib/utils/feedback-responses';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: feedback.id,
        email: feedback.email,
        type: feedback.type,
        category: feedback.category,
        message: feedback.message,
        pageUrl: feedback.pageUrl,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .orderBy(desc(feedback.createdAt))
      .limit(200);

    res.status(200).json(await attachResponses(db, rows));
  } catch (err) {
    console.error('[api/admin/feedback] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
}
