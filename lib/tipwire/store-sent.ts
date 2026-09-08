/**
 * R-TIPWIRE sent log + candidate status (#858): the owner's actions
 * (`tips:sent --candidate N [--reporter a,b] [--replied|--dismiss]`) and the
 * reads the cadence guard and digest reminder depend on. Split from ./store
 * to keep each module under the size limit; same rules — never touches
 * `documents`.
 *
 * A candidate that lists several reporters (beat rows since R-TIPWIRE-4 #877)
 * takes one send per reporter and stays `open` until every listed reporter
 * has one; `--dismiss` closes it for the rest.
 */

import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { tipArticles, tipCandidates, tipSentLog } from '@/lib/db/schema';
import { ONE_DAY_MS } from '@/lib/utils/date-utils';
import { COOLDOWN_MS, isInCooldown } from './cadence';
import type { SentRow } from './cadence';
import type { ReminderRow } from './digest';
import { getReporter } from './roster';
import { listedReporterIds } from './store-candidates';

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
    reporterId: r.reporterId,
    reporterName: getReporter(r.reporterId)?.name ?? r.reporterId,
    title: r.title,
    sentAt: r.sentAt,
  }));
}

async function candidateListing(
  candidateId: number,
): Promise<{ listed: string[]; status: string }> {
  const [c] = await getDb()
    .select({
      reporterId: sql<string>`COALESCE(${tipCandidates.reporterId}, ${tipArticles.reporterId})`,
      reporterIds: tipCandidates.reporterIds,
      status: tipCandidates.status,
    })
    .from(tipCandidates)
    .leftJoin(tipArticles, eq(tipArticles.id, tipCandidates.articleId))
    .where(eq(tipCandidates.id, candidateId));
  if (!c) throw new Error(`candidate ${candidateId} not found`);
  return { listed: listedReporterIds(c), status: c.status };
}

/** Which listed reporters an owner action targets; a multi-reporter candidate must name them. */
export function pickReporters(
  candidateId: number,
  listed: readonly string[],
  requested: readonly string[] | undefined,
): string[] {
  if (!requested || requested.length === 0) {
    if (listed.length > 1)
      throw new Error(
        `candidate #${candidateId} lists reporters ${listed.join(', ')} — pass --reporter id[,id]`,
      );
    return [...listed];
  }
  const unknown = requested.filter((id) => !listed.includes(id));
  if (unknown.length > 0)
    throw new Error(
      `candidate #${candidateId} does not list ${unknown.join(', ')} (listed: ${listed.join(', ')})`,
    );
  return [...new Set(requested)];
}

/** Listed reporters the cadence guard would refuse right now. */
export function heldReporters(targets: readonly string[], sent: SentRow[], now: Date): string[] {
  return targets.filter((id) => isInCooldown(id, sent, now));
}

/** `tips:sent --candidate N [--reporter a,b]`: log each send; close the candidate once every
 *  listed reporter has one. Refuses a reporter in unreplied cooldown unless `ignoreCadence`
 *  — the guard that the poll applied when the candidate was stored, re-applied at send time. */
export async function recordSent(
  candidateId: number,
  reporterIds?: readonly string[],
  opts: { ignoreCadence?: boolean; note?: string } = {},
): Promise<string[]> {
  const db = getDb();
  const { listed } = await candidateListing(candidateId);
  const targets = pickReporters(candidateId, listed, reporterIds);
  if (!opts.ignoreCadence) {
    const held = heldReporters(targets, await sentLogForReporters(30), new Date());
    if (held.length > 0)
      throw new Error(
        `${held.join(', ')}: in the ${COOLDOWN_MS / ONE_DAY_MS / 7}-week unreplied cooldown — mark the earlier send --replied first, or pass --ignore-cadence`,
      );
  }
  const already = new Set(
    (
      await db
        .select({ reporterId: tipSentLog.reporterId })
        .from(tipSentLog)
        .where(eq(tipSentLog.candidateId, candidateId))
    ).map((r) => r.reporterId),
  );
  const fresh = targets.filter((id) => !already.has(id));
  if (fresh.length === 0)
    throw new Error(`candidate #${candidateId} already marked sent to ${targets.join(', ')}`);
  await db
    .insert(tipSentLog)
    .values(fresh.map((reporterId) => ({ candidateId, reporterId, note: opts.note ?? null })));
  const allSent = listed.every((id) => already.has(id) || fresh.includes(id));
  if (allSent)
    await db.update(tipCandidates).set({ status: 'sent' }).where(eq(tipCandidates.id, candidateId));
  return fresh;
}

/** Which of the requested (or the only) reporters have an unreplied send to close. */
export function pickUnreplied(
  candidateId: number,
  listed: readonly string[],
  unreplied: readonly string[],
  requested: readonly string[] | undefined,
): string[] {
  const distinct = [...new Set(unreplied)];
  if (distinct.length === 0) return [];
  if (!requested || requested.length === 0) {
    if (distinct.length > 1)
      throw new Error(
        `candidate #${candidateId} has unreplied sends to ${distinct.join(', ')} — pass --reporter id[,id]`,
      );
    return distinct;
  }
  const chosen = pickReporters(candidateId, listed, requested);
  const noSend = chosen.filter((id) => !distinct.includes(id));
  if (noSend.length > 0)
    throw new Error(
      `candidate #${candidateId}: no unreplied send to ${noSend.join(', ')} (unreplied: ${distinct.join(', ') || 'none'})`,
    );
  return chosen;
}

/** `tips:sent --candidate N [--reporter x] --replied`: lift the cooldown for that send. */
export async function recordReply(
  candidateId: number,
  reporterIds?: readonly string[],
): Promise<boolean> {
  const db = getDb();
  const { listed } = await candidateListing(candidateId);
  const unreplied = await db
    .select({ reporterId: tipSentLog.reporterId })
    .from(tipSentLog)
    .where(and(eq(tipSentLog.candidateId, candidateId), isNull(tipSentLog.repliedAt)));
  const targets = pickUnreplied(
    candidateId,
    listed,
    unreplied.map((r) => r.reporterId),
    reporterIds,
  );
  if (targets.length === 0) return false;
  const rows = await db
    .update(tipSentLog)
    .set({ repliedAt: new Date() })
    .where(
      and(
        eq(tipSentLog.candidateId, candidateId),
        isNull(tipSentLog.repliedAt),
        inArray(tipSentLog.reporterId, targets),
      ),
    )
    .returning({ id: tipSentLog.id });
  return rows.length > 0;
}

/** `tips:sent --candidate N --dismiss`: close without a log row (no cooldown); remaining reporters get nothing. */
export async function dismissCandidate(candidateId: number): Promise<boolean> {
  const rows = await getDb()
    .update(tipCandidates)
    .set({ status: 'dismissed' })
    .where(and(eq(tipCandidates.id, candidateId), eq(tipCandidates.status, 'open')))
    .returning({ id: tipCandidates.id });
  return rows.length > 0;
}
