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

/** The reply email sent to a submitter who left an address (#672). */
export function buildSubmitterResponseHtml(original: string, reply: string): string {
  return (
    `<h2 style="font-family:sans-serif">Response to your Democracy Monitor feedback</h2>` +
    `<p style="font-family:sans-serif">You wrote:</p>` +
    `<blockquote style="font-family:sans-serif;color:#555;border-left:3px solid #ccc;margin:0;padding:4px 12px;white-space:pre-wrap">${escapeHtml(original)}</blockquote>` +
    `<p style="font-family:sans-serif">Our response:</p>` +
    `<p style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(reply)}</p>` +
    `<p style="font-family:sans-serif;font-size:12px;color:#666">This response also appears on the public feedback page at democracymonitor.us/feedback.</p>`
  );
}

/** Email the submitter our reply. Non-fatal — the response is already stored + published. */
export async function notifySubmitterOfResponse(
  to: string,
  original: string,
  reply: string,
): Promise<void> {
  try {
    await sendEmail(
      to,
      'Response to your Democracy Monitor feedback',
      buildSubmitterResponseHtml(original, reply),
    );
  } catch (err) {
    console.error('[feedback-notify] submitter response send failed:', err);
  }
}
