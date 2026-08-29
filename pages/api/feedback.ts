/**
 * POST /api/feedback — submit user feedback.
 * GET  /api/feedback — list public feedback (no emails).
 */

import { desc, eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod/v4';
import { getDb } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
import { notifyNewFeedback } from '@/lib/services/feedback-notify';
import { verifyTurnstile } from '@/lib/services/turnstile';
import { requireDb } from '@/lib/utils/api-helpers';
import { attachResponses } from '@/lib/utils/feedback-responses';
import { enforceRateLimit, getClientIp, RATE_LIMITS } from '@/lib/utils/rate-limit';

const VALID_TYPES = ['suggestion', 'data-issue', 'question', 'other', 'dispute'] as const;

/** A dispute of one document's AI reading (#815) — structured so the public
 *  list can show what was disputed and the ledger can answer it. */
export const DisputeMetadataSchema = z.object({
  documentId: z.number().int().positive().nullable().optional(),
  url: z.string().max(1000).nullable().optional(),
  title: z.string().min(1).max(300),
  category: z.string().min(1).max(50),
  weekOf: z.string().max(10).nullable().optional(),
  verdict: z.string().min(1).max(40),
  erosionType: z.string().max(40).nullable().optional(),
  surface: z.enum(['week', 'research', 'explore']),
});

const FeedbackSchema = z
  .object({
    email: z.email().optional(),
    category: z.string().max(50).optional(),
    type: z.enum(VALID_TYPES),
    message: z
      .string()
      .min(1, 'Message is required')
      .max(5000, 'Message too long (max 5000 chars)'),
    pageUrl: z.string().max(500).optional(),
    // Cloudflare Turnstile token; optional here because dev/local runs without
    // keys — verifyTurnstile enforces it whenever TURNSTILE_SECRET_KEY is set.
    turnstileToken: z.string().optional(),
    metadata: DisputeMetadataSchema.optional(),
  })
  .refine((f) => f.type !== 'dispute' || f.metadata != null, {
    message: 'A dispute must say which document and which reading it disputes',
    path: ['metadata'],
  });

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireDb(res)) return;

  if (req.method === 'GET') {
    return handleGet(res);
  }
  if (req.method === 'POST') {
    const policy = req.body?.type === 'dispute' ? RATE_LIMITS.dispute : RATE_LIMITS.email;
    if (!(await enforceRateLimit(req, res, policy))) return;
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
        metadata: feedback.metadata,
      })
      .from(feedback)
      .where(eq(feedback.approved, true))
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

  if (!(await verifyTurnstile(parsed.data.turnstileToken, getClientIp(req)))) {
    res.status(400).json({ error: 'Bot check failed — please retry.' });
    return;
  }

  try {
    const db = getDb();
    // approved defaults to false — hidden from the public GET until a moderator
    // approves via `pnpm feedback:moderate --approve <id>` (#668/#671).
    const [row] = await db
      .insert(feedback)
      .values({
        email: parsed.data.email || null,
        category: parsed.data.category || null,
        type: parsed.data.type,
        message: parsed.data.message,
        pageUrl: parsed.data.pageUrl || null,
        metadata: parsed.data.type === 'dispute' ? (parsed.data.metadata ?? null) : null,
      })
      .returning({ id: feedback.id });

    // Non-fatal: a notification failure must not fail the submission.
    await notifyNewFeedback({
      id: row.id,
      type: parsed.data.type,
      category: parsed.data.category || null,
      message: parsed.data.message,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[api/feedback] POST error:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
}
