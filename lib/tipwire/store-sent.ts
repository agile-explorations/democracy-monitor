/**
 * R-TIPWIRE sent log + candidate status (#858): the owner's actions
 * (`tips:sent --candidate N [--replied|--dismiss]`) and the reads the
 * cadence guard and digest reminder depend on. Split from ./store to keep
 * each module under the size limit; same rules — never touches `documents`.
 */

import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { tipArticles, tipCandidates, tipSentLog } from '@/lib/db/schema';
import { ONE_DAY_MS } from '@/lib/utils/date-utils';
import { COOLDOWN_MS } from './cadence';
import type { SentRow } from './cadence';
import type { ReminderRow } from './digest';
import { getReporter } from './roster';

export async function sentLogForReporters(days: number): Promise<SentRow[]> {
  const rows = await getDb()
    .select({
      reporterId: tipSentLog.reporterId,
      sentAt: tipSentLog.sentAt,
      repliedAt: tipSentLog.repliedAt,
    })
    .from(tipSentLog)
    .where(gte(tipSentLog.sentAt, new Date(Date.now() - Math.max(days * ONE_DAY_MS, COOLDOWN_MS))));
  return rows;
}

export async function listUnrepliedSent(minAgeDays: number): Promise<ReminderRow[]> {
  const rows = await getDb()
    .select({
      candidateId: tipSentLog.candidateId,
      reporterId: tipSentLog.reporterId,
      sentAt: tipSentLog.sentAt,
      title: sql<string>`COALESCE(${tipArticles.title}, 'Beat check — week of ' || COALESCE(${tipCandidates.sinceAt}::date::text, '?'))`,
    })
    .from(tipSentLog)
    .innerJoin(tipCandidates, eq(tipCandidates.id, tipSentLog.candidateId))
    .leftJoin(tipArticles, eq(tipArticles.id, tipCandidates.articleId))
    .where(
      and(
        isNull(tipSentLog.repliedAt),
        sql`${tipSentLog.sentAt} <= now() - make_interval(days => ${minAgeDays})`,
      ),
    )
    .orderBy(desc(tipSentLog.sentAt));
  return rows.map((r) => ({
    candidateId: r.candidateId,
    reporterName: getReporter(r.reporterId)?.name ?? r.reporterId,
    title: r.title,
    sentAt: r.sentAt,
  }));
}

/** `tips:sent --candidate N`: log the send and close the candidate. */
export async function recordSent(candidateId: number, note?: string): Promise<string> {
  const db = getDb();
  const [c] = await db
    .select({
      id: tipCandidates.id,
      reporterId: sql<string>`COALESCE(${tipCandidates.reporterId}, ${tipArticles.reporterId})`,
      status: tipCandidates.status,
    })
    .from(tipCandidates)
    .leftJoin(tipArticles, eq(tipArticles.id, tipCandidates.articleId))
    .where(eq(tipCandidates.id, candidateId));
  if (!c) throw new Error(`candidate ${candidateId} not found`);
  await db.insert(tipSentLog).values({ candidateId, reporterId: c.reporterId, note: note ?? null });
  await db.update(tipCandidates).set({ status: 'sent' }).where(eq(tipCandidates.id, candidateId));
  return c.reporterId;
}

/** `tips:sent --candidate N --replied`: lift the cooldown for that send. */
export async function recordReply(candidateId: number): Promise<boolean> {
  const rows = await getDb()
    .update(tipSentLog)
    .set({ repliedAt: new Date() })
    .where(and(eq(tipSentLog.candidateId, candidateId), isNull(tipSentLog.repliedAt)))
    .returning({ id: tipSentLog.id });
  return rows.length > 0;
}

/** `tips:sent --candidate N --dismiss`: close without a log row (no cooldown). */
export async function dismissCandidate(candidateId: number): Promise<boolean> {
  const rows = await getDb()
    .update(tipCandidates)
    .set({ status: 'dismissed' })
    .where(and(eq(tipCandidates.id, candidateId), eq(tipCandidates.status, 'open')))
    .returning({ id: tipCandidates.id });
  return rows.length > 0;
}
