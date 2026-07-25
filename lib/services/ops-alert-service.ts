/**
 * Operator alert emails. Sends full error details to the address in
 * OPS_ALERT_EMAIL (owner's inbox — NOT the subscriber list) when a cron run
 * accumulates errors or crashes. Degrades to a console warning when the
 * variable or RESEND_API_KEY is unset, and never throws: alerting must not
 * change a run's outcome.
 */

import { sendEmail } from '@/lib/services/email-service';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain report layout: a heading, then each detail in a monospace block. */
export function buildOpsAlertHtml(title: string, details: string[]): string {
  const items = details
    .map(
      (d) =>
        `<pre style="background:#f4f4f4;padding:8px 12px;border-radius:4px;white-space:pre-wrap;font-size:13px;margin:0 0 8px">${escapeHtml(d)}</pre>`,
    )
    .join('\n');
  return `<h2 style="font-family:sans-serif">${escapeHtml(title)}</h2>\n${items}\n<p style="font-family:sans-serif;font-size:12px;color:#666">Automated operator alert from the Democracy Monitor cron. Recipient is set by OPS_ALERT_EMAIL.</p>`;
}

export async function sendOpsAlert(subject: string, details: string[]): Promise<boolean> {
  try {
    const to = process.env.OPS_ALERT_EMAIL;
    if (!to) {
      console.warn('[ops-alert] OPS_ALERT_EMAIL not configured — alert not sent');
      return false;
    }
    return await sendEmail(to, subject, buildOpsAlertHtml(subject, details));
  } catch (err) {
    console.error('[ops-alert] Failed to send alert:', err);
    return false;
  }
}
