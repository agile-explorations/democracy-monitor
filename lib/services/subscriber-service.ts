/**
 * Subscriber service — CRUD, double opt-in confirmation, and weekly digest sending.
 */

import { randomBytes } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscribers } from '@/lib/db/schema';
import { sleep } from '@/lib/utils/async';
import {
  isEmailConfigured,
  renderConfirmationEmail,
  renderWeeklyEmail,
  sendEmail,
} from './email-service';
import { getStoredNarrative } from './narrative-store';

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------------
// Subscriber CRUD
// ---------------------------------------------------------------------------

/**
 * Create or re-activate a subscriber. Idempotent:
 * - New email → insert, send confirmation
 * - Existing unconfirmed → regenerate token, resend confirmation
 * - Existing unsubscribed → re-subscribe, regenerate token, send confirmation
 * - Existing confirmed → no-op (already subscribed)
 */
export async function createSubscriber(email: string): Promise<{ alreadyConfirmed: boolean }> {
  const db = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    const sub = existing[0];
    if (sub.confirmed && !sub.unsubscribedAt) {
      return { alreadyConfirmed: true };
    }

    // Re-activate or resend confirmation
    const token = generateToken();
    await db
      .update(subscribers)
      .set({
        confirmToken: token,
        confirmed: false,
        confirmedAt: null,
        unsubscribedAt: null,
      })
      .where(eq(subscribers.id, sub.id));

    await sendEmail(normalizedEmail, 'Confirm your subscription', renderConfirmationEmail(token));
    return { alreadyConfirmed: false };
  }

  // New subscriber
  const token = generateToken();
  await db.insert(subscribers).values({
    email: normalizedEmail,
    confirmToken: token,
  });

  await sendEmail(normalizedEmail, 'Confirm your subscription', renderConfirmationEmail(token));
  return { alreadyConfirmed: false };
}

/** Confirm a subscriber by token. Returns true if confirmed, false if token not found. */
export async function confirmSubscriber(token: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(subscribers)
    .set({ confirmed: true, confirmedAt: new Date() })
    .where(and(eq(subscribers.confirmToken, token), eq(subscribers.confirmed, false)));

  return (result.rowCount ?? 0) > 0;
}

/** Unsubscribe by token. Returns true if unsubscribed, false if token not found. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(subscribers)
    .set({ unsubscribedAt: new Date() })
    .where(and(eq(subscribers.confirmToken, token), isNull(subscribers.unsubscribedAt)));

  return (result.rowCount ?? 0) > 0;
}

/** Get all confirmed, non-unsubscribed subscribers. */
async function getConfirmedSubscribers() {
  const db = getDb();
  return db
    .select({ email: subscribers.email, confirmToken: subscribers.confirmToken })
    .from(subscribers)
    .where(and(eq(subscribers.confirmed, true), isNull(subscribers.unsubscribedAt)));
}

// ---------------------------------------------------------------------------
// Weekly digest
// ---------------------------------------------------------------------------

/**
 * Send the weekly public overview narrative to all confirmed subscribers.
 * Returns the number of emails sent.
 */
export async function sendWeeklyDigest(weekOf: string): Promise<number> {
  if (!isEmailConfigured()) {
    console.warn('[subscriber] Email not configured — skipping weekly digest');
    return 0;
  }

  const narrative = await getStoredNarrative('_overview', weekOf, 'public');
  if (!narrative) {
    console.warn(`[subscriber] No public overview narrative for ${weekOf} — skipping digest`);
    return 0;
  }

  const subs = await getConfirmedSubscribers();
  if (subs.length === 0) {
    console.log('[subscriber] No confirmed subscribers — skipping digest');
    return 0;
  }

  const subject = `Democracy Monitor — Week of ${weekOf}`;
  let sent = 0;

  for (const sub of subs) {
    const html = renderWeeklyEmail(narrative.content, weekOf, sub.confirmToken);
    const ok = await sendEmail(sub.email, subject, html);
    if (ok) sent++;
    // Respect Resend free tier rate limits
    if (sent < subs.length) await sleep(100);
  }

  console.log(`[subscriber] Weekly digest sent to ${sent}/${subs.length} subscribers`);
  return sent;
}
