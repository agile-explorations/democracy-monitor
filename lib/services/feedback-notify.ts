/**
 * New-feedback notification (#669). Emails OPS_ALERT_EMAIL when a submission
 * lands, with the approve/reject CLI commands. Non-fatal by design — a
 * notification failure must never fail the user's submission.
 */

import { sendEmail } from '@/lib/services/email-service';

const PREVIEW_CHARS = 500;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface NewFeedback {
  id: number;
  type: string;
  category: string | null;
  message: string;
}

export function buildFeedbackNotificationHtml(fb: NewFeedback): string {
  const preview =
    fb.message.length > PREVIEW_CHARS ? `${fb.message.slice(0, PREVIEW_CHARS)}…` : fb.message;
  const tag = fb.category
    ? `${escapeHtml(fb.type)} · ${escapeHtml(fb.category)}`
    : escapeHtml(fb.type);
  return (
    `<h2 style="font-family:sans-serif">New feedback (pending approval)</h2>` +
    `<p style="font-family:sans-serif"><strong>#${fb.id}</strong> · ${tag}</p>` +
    `<pre style="font-family:sans-serif;white-space:pre-wrap;background:#f5f5f5;padding:8px;border-radius:4px">${escapeHtml(preview)}</pre>` +
    `<p style="font-family:sans-serif;font-size:12px;color:#666">Approve: <code>pnpm feedback:moderate --approve ${fb.id}</code> &middot; Reject: <code>pnpm feedback:moderate --reject ${fb.id}</code></p>`
  );
}

export async function notifyNewFeedback(fb: NewFeedback): Promise<void> {
  const to = process.env.OPS_ALERT_EMAIL;
  if (!to) {
    console.warn('[feedback-notify] OPS_ALERT_EMAIL not set — notification skipped');
    return;
  }
  try {
    await sendEmail(to, `New feedback (pending): ${fb.type}`, buildFeedbackNotificationHtml(fb));
  } catch (err) {
    console.error('[feedback-notify] send failed:', err);
  }
}
