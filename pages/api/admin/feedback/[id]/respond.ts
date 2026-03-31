/**
 * POST /api/admin/feedback/[id]/respond — save admin response and email user if they provided an email.
 */

import { eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod/v4';
import { getDb } from '@/lib/db';
import { feedback, feedbackResponses } from '@/lib/db/schema';
import { isEmailConfigured, sendEmail } from '@/lib/services/email-service';
import { requireAdmin, requireDb, requireMethod } from '@/lib/utils/api-helpers';

const ResponseSchema = z.object({
  message: z.string().min(1, 'Response is required').max(5000, 'Response too long'),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;
  if (!requireDb(res)) return;
  if (!requireAdmin(req, res)) return;

  const feedbackId = Number(req.query.id);
  if (!Number.isFinite(feedbackId) || feedbackId < 1) {
    res.status(400).json({ error: 'Invalid feedback ID' });
    return;
  }

  const parsed = ResponseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  try {
    const db = getDb();

    // Verify feedback exists and get email
    const [fb] = await db
      .select({ id: feedback.id, email: feedback.email, message: feedback.message })
      .from(feedback)
      .where(eq(feedback.id, feedbackId))
      .limit(1);

    if (!fb) {
      res.status(404).json({ error: 'Feedback not found' });
      return;
    }

    // Save response
    await db.insert(feedbackResponses).values({
      feedbackId,
      message: parsed.data.message,
    });

    // Email user if they provided an email and Resend is configured
    let emailed = false;
    if (fb.email && isEmailConfigured()) {
      emailed = await sendEmail(
        fb.email,
        'Response to your Democracy Monitor feedback',
        renderFeedbackResponseEmail(fb.message, parsed.data.message),
      );
    }

    res.status(200).json({ success: true, emailed });
  } catch (err) {
    console.error('[api/admin/feedback/respond] error:', err);
    res.status(500).json({ error: 'Failed to save response' });
  }
}

function renderFeedbackResponseEmail(originalMessage: string, responseMessage: string): string {
  const s = {
    body: 'margin:0;padding:0;background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif',
    container: 'max-width:600px;margin:0 auto;padding:32px 24px',
    heading: 'color:#f0f6fc;font-size:20px;font-weight:600;margin:0 0 16px',
    text: 'color:#c9d1d9;font-size:14px;line-height:1.6;margin:0 0 16px',
    quote:
      'border-left:3px solid #30363d;padding:8px 12px;margin:0 0 16px;color:#8b949e;font-size:13px',
    footer:
      'color:#8b949e;font-size:12px;line-height:1.5;margin-top:32px;padding-top:16px;border-top:1px solid #30363d',
  };

  // Truncate long original messages in the email
  const truncated =
    originalMessage.length > 300 ? originalMessage.slice(0, 300) + '...' : originalMessage;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${s.body}">
<div style="${s.container}">
<h1 style="${s.heading}">Response to your feedback</h1>
<p style="${s.text}">You submitted feedback to Democracy Monitor:</p>
<blockquote style="${s.quote}">${escapeHtml(truncated)}</blockquote>
<p style="${s.text}"><strong style="color:#f0f6fc">Our response:</strong></p>
<p style="${s.text}">${escapeHtml(responseMessage)}</p>
<div style="${s.footer}">
<p style="color:#8b949e;font-size:11px;margin:8px 0 0">Democracy Monitor — Open-source democracy erosion monitoring</p>
</div>
</div>
</body></html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
