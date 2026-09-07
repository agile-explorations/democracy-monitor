/**
 * R-TIPWIRE cadence guard (#858, owner constraint): never propose a second
 * tip to a reporter tipped within COOLDOWN_WEEKS without a reply. A reply
 * (`tips:sent --replied`) lifts the cooldown immediately; a dismissal never
 * starts one. Skipped articles spend nothing (no retrieval, no AI call).
 */

import { ONE_DAY_MS } from '@/lib/utils/date-utils';

export const COOLDOWN_WEEKS = 3;
export const COOLDOWN_MS = COOLDOWN_WEEKS * 7 * ONE_DAY_MS;
/** Sent-but-unreplied candidates older than this are surfaced as "mark these?". */
export const REMINDER_AFTER_DAYS = 7;

export interface SentRow {
  reporterId: string;
  sentAt: Date;
  repliedAt: Date | null;
}

export function isInCooldown(reporterId: string, sent: SentRow[], now: Date): boolean {
  return sent.some(
    (r) =>
      r.reporterId === reporterId &&
      r.repliedAt === null &&
      now.getTime() - r.sentAt.getTime() <= COOLDOWN_MS,
  );
}

export function cadenceLabel(reporterId: string, sent: SentRow[], now: Date): string {
  const mine = sent.filter((r) => r.reporterId === reporterId);
  if (mine.length === 0) return 'never tipped';
  const last = mine.reduce((a, b) => (a.sentAt > b.sentAt ? a : b));
  const days = Math.floor((now.getTime() - last.sentAt.getTime()) / ONE_DAY_MS);
  if (last.repliedAt) return `last tip ${days}d ago — replied`;
  return isInCooldown(reporterId, sent, now)
    ? `last tip ${days}d ago — no reply, in ${COOLDOWN_WEEKS}-week cooldown`
    : `last tip ${days}d ago — no reply, cooldown over`;
}

export function needsReplyReminder(row: SentRow, now: Date): boolean {
  return (
    row.repliedAt === null &&
    now.getTime() - row.sentAt.getTime() >= REMINDER_AFTER_DAYS * ONE_DAY_MS
  );
}
