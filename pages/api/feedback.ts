/**
 * POST /api/feedback — submit user feedback.
 *
 * Body: { email?: string, category?: string, type: string, message: string, pageUrl?: string }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod/v4';
import { getDb } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

const VALID_TYPES = ['suggestion', 'data-issue', 'question', 'other'] as const;

const FeedbackSchema = z.object({
  email: z.email().optional(),
  category: z.string().max(50).optional(),
  type: z.enum(VALID_TYPES),
  message: z.string().min(1, 'Message is required').max(5000, 'Message too long (max 5000 chars)'),
  pageUrl: z.string().max(500).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireDb(res)) return;

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
    console.error('[api/feedback] Error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
}
