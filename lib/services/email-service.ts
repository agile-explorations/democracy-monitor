/**
 * Email service — Resend wrapper for transactional and newsletter emails.
 *
 * Gracefully degrades when RESEND_API_KEY is not configured (logs a warning).
 * All email templates use inline styles for email client compatibility.
 */

import { Resend } from 'resend';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://democracymonitor.us';
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'Democracy Monitor <updates@democracymonitor.us>';

let resendClient: Resend | null = null;

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const client = getClient();
  if (!client) {
    console.warn('[email] RESEND_API_KEY not configured — email not sent');
    return false;
  }

  const { error } = await client.emails.send({ from: FROM_EMAIL, to, subject, html });
  if (error) {
    console.error('[email] Send failed:', error);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Email templates (inline-styled HTML for email client compatibility)
// ---------------------------------------------------------------------------

const STYLES = {
  body: 'margin:0;padding:0;background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif',
  container: 'max-width:600px;margin:0 auto;padding:32px 24px',
  heading: 'color:#f0f6fc;font-size:20px;font-weight:600;margin:0 0 16px',
  text: 'color:#c9d1d9;font-size:14px;line-height:1.6;margin:0 0 16px',
  button:
    'display:inline-block;padding:10px 24px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500',
  footer:
    'color:#8b949e;font-size:12px;line-height:1.5;margin-top:32px;padding-top:16px;border-top:1px solid #30363d',
  link: 'color:#7c3aed;text-decoration:underline',
} as const;

function emailWrapper(content: string, footerHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${STYLES.body}">
<div style="${STYLES.container}">
${content}
<div style="${STYLES.footer}">
${footerHtml}
<p style="color:#8b949e;font-size:11px;margin:8px 0 0">Democracy Monitor — Open-source democracy erosion monitoring</p>
</div>
</div>
</body></html>`;
}

export function renderConfirmationEmail(token: string): string {
  const confirmUrl = `${SITE_URL}/api/subscribers/confirm?token=${token}`;
  return emailWrapper(
    `<h1 style="${STYLES.heading}">Confirm your subscription</h1>
<p style="${STYLES.text}">You requested to receive weekly summaries from Democracy Monitor. Click the button below to confirm.</p>
<p style="margin:24px 0"><a href="${confirmUrl}" style="${STYLES.button}">Confirm subscription</a></p>
<p style="${STYLES.text}">If you didn't request this, you can safely ignore this email.</p>`,
    `<p style="color:#8b949e;font-size:12px">If the button doesn't work, copy this link: ${confirmUrl}</p>`,
  );
}

export function renderWeeklyEmail(
  narrativeMarkdown: string,
  weekOf: string,
  unsubscribeToken: string,
): string {
  const unsubscribeUrl = `${SITE_URL}/api/subscribers/unsubscribe?token=${unsubscribeToken}`;
  const weekUrl = `${SITE_URL}/weekly/${weekOf}`;

  // Convert markdown to simple HTML (narratives use: headers, bold, links, paragraphs, lists)
  const narrativeHtml = markdownToEmailHtml(narrativeMarkdown);

  return emailWrapper(
    `<h1 style="${STYLES.heading}">Week of ${weekOf}</h1>
<div style="${STYLES.text}">${narrativeHtml}</div>
<p style="margin:24px 0"><a href="${weekUrl}" style="${STYLES.button}">View full analysis</a></p>`,
    `<p style="color:#8b949e;font-size:12px"><a href="${unsubscribeUrl}" style="color:#8b949e">Unsubscribe</a> from weekly updates</p>`,
  );
}

/** Minimal markdown→HTML for email (handles the subset used by narratives). */
function markdownToEmailHtml(md: string): string {
  return md
    .replace(
      /^### (.+)$/gm,
      `<h3 style="color:#f0f6fc;font-size:15px;font-weight:600;margin:16px 0 8px">$1</h3>`,
    )
    .replace(
      /^## (.+)$/gm,
      `<h2 style="color:#f0f6fc;font-size:17px;font-weight:600;margin:20px 0 8px">$1</h2>`,
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f0f6fc">$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" style="${STYLES.link}">$1</a>`)
    .replace(/^- (.+)$/gm, `<li style="margin:4px 0">$1</li>`)
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="padding-left:20px;margin:8px 0">$&</ul>')
    .replace(/\n\n/g, '</p><p style="margin:0 0 12px">')
    .replace(/^(?!<[hulo])(.+)$/gm, '<p style="margin:0 0 12px">$1</p>')
    .replace(/<p style="margin:0 0 12px"><\/p>/g, '');
}
