/**
 * POST /api/feedback — submit user feedback.
 * GET  /api/feedback — list public feedback (no emails).
 */

import { desc } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod/v4';
import { getDb } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
import { requireDb } from '@/lib/utils/api-helpers';
import { attachResponses } from '@/lib/utils/feedback-responses';

const VALID_TYPES = ['suggestion', 'data-issue', 'question', 'other'] as const;

const FeedbackSchema = z.object({
  email: z.email().optional(),
  category: z.string().max(50).optional(),
  type: z.enum(VALID_TYPES),
  message: z.string().min(1, 'Message is required').max(5000, 'Message too long (max 5000 chars)'),
  pageUrl: z.string().max(500).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireDb(res)) return;

  if (req.method === 'GET') {
    return handleGet(res);
  }
  if (req.method === 'POST') {
    return handlePost(req, res);
  }
  res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(res: NextApiResponse): Promise<void> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: feedback.id,
        type: feedback.type,
        category: feedback.category,
        message: feedback.message,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .orderBy(desc(feedback.createdAt))
      .limit(100);

    res.status(200).json(await attachResponses(db, rows));
  } catch (err) {
    console.error('[api/feedback] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  try {
    const db = getDb();
    await db.insert(feedback).values({
      email: parsed.data.email || null,
      category: parsed.data.category || null,
      type: parsed.data.type,
      message: parsed.data.message,
      pageUrl: parsed.data.pageUrl || null,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[api/feedback] POST error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
}
