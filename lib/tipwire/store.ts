/**
 * R-TIPWIRE persistence (#858): the only module that writes tip_* rows.
 * It never touches `documents` (news does not enter the corpus); the
 * boundary test in __tests__/lib/tipwire/boundary.test.ts enforces it.
 */

import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { tipArticles, tipCandidates, tipSentLog } from '@/lib/db/schema';
import type { TipPayload } from '@/lib/db/schema';
import { ONE_DAY_MS } from '@/lib/utils/date-utils';
import type { DiscoveredArticle } from './acquire';
import { COOLDOWN_MS } from './cadence';
import type { SentRow } from './cadence';
import type { DigestCandidate, ReminderRow } from './digest';
import type { PipelineItem } from './pipeline';
import { RECENT_TITLES_DAYS } from './prompt';
import { getReporter } from './roster';

export async function knownKeysFor(reporterId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ key: tipArticles.articleKey })
    .from(tipArticles)
    .where(eq(tipArticles.reporterId, reporterId));
  return new Set(rows.map((r) => r.key));
}

/** Insert new articles; returns article ids keyed by article_key (existing rows included). */
export async function upsertArticles(articles: DiscoveredArticle[]): Promise<Map<string, number>> {
  const db = getDb();
  if (articles.length > 0) {
    await db
      .insert(tipArticles)
      .values(
        articles.map((a) => ({
          reporterId: a.reporterId,
          outlet: a.outlet,
          articleKey: a.articleKey,
          url: a.url,
          title: a.title,
          lede: a.lede,
          ledeSource: a.ledeSource,
          publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
          feedStrategy: a.feedStrategy,
          attribution: a.attribution,
          coauthorCount: a.coauthorCount,
          rawMeta: a.rawMeta,
        })),
      )
      .onConflictDoNothing({ target: [tipArticles.reporterId, tipArticles.articleKey] });
  }
  const keys = articles.map((a) => a.articleKey);
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({ id: tipArticles.id, key: tipArticles.articleKey })
    .from(tipArticles)
    .where(inArray(tipArticles.articleKey, keys));
  return new Map(rows.map((r) => [r.key, r.id]));
}

/** The reporter's stored titles within RECENT_TITLES_DAYS of `around` (same-story context). */
export async function recentTitlesFromDb(reporterId: string, around: Date): Promise<string[]> {
  const rows = await getDb()
    .select({ title: tipArticles.title, key: tipArticles.articleKey })
    .from(tipArticles)
    .where(
      and(
        eq(tipArticles.reporterId, reporterId),
        gte(tipArticles.publishedAt, new Date(around.getTime() - RECENT_TITLES_DAYS * ONE_DAY_MS)),
      ),
    )
    .orderBy(desc(tipArticles.publishedAt))
    .limit(20);
  return rows.map((r) => r.title);
}

export async function insertCandidate(
  articleId: number,
  item: PipelineItem,
  runId: string,
): Promise<number> {
  const j = item.judge;
  const [row] = await getDb()
    .insert(tipCandidates)
    .values({
      articleId,
      verdict: j.verdict,
      tip: j.tip
        ? {
            sentences: j.tip.sentences,
            specificClaim: j.tip.specificClaim,
            whyUnreportedAppears: j.tip.whyUnreportedAppears,
            confidence: j.tip.confidence,
          }
        : null,
      tipDocumentId: j.tip?.documentId ?? null,
      reasonsNoTip: j.reasonsNoTip ?? j.error ?? null,
      matchedDocs: item.match.docs.map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        finalScore: null,
        priorBoosted: d.priorBoosted,
      })),
      retrievalMeta: {
        ...item.match.meta,
        window: item.match.window,
        queryMode: item.match.queryMode,
      },
      promptVersion: j.promptVersion || null,
      model: j.model,
      tokensIn: j.tokensIn,
      tokensOut: j.tokensOut,
      latencyMs: j.latencyMs,
      reactive: item.reactive,
      runId,
      status: 'open',
    })
    .returning({ id: tipCandidates.id });
  return row.id;
}

export async function insertSkippedForCadence(articleId: number, runId: string): Promise<void> {
  await getDb().insert(tipCandidates).values({
    articleId,
    verdict: 'skipped_cadence',
    runId,
    status: 'dismissed',
  });
}

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

interface CandidateJoin {
  id: number;
  reporterId: string;
  outlet: string;
  title: string;
  url: string | null;
  publishedAt: Date | null;
  ledeSource: string;
  coauthorCount: number;
  reactive: boolean;
  tip: TipPayload | null;
  tipDocumentId: number | null;
  createdAt: Date;
}

async function candidateRows(where: ReturnType<typeof eq>): Promise<CandidateJoin[]> {
  return getDb()
    .select({
      id: tipCandidates.id,
      reporterId: tipArticles.reporterId,
      outlet: tipArticles.outlet,
      title: tipArticles.title,
      url: tipArticles.url,
      publishedAt: tipArticles.publishedAt,
      ledeSource: tipArticles.ledeSource,
      coauthorCount: tipArticles.coauthorCount,
      reactive: tipCandidates.reactive,
      tip: tipCandidates.tip,
      tipDocumentId: tipCandidates.tipDocumentId,
      createdAt: tipCandidates.createdAt,
    })
    .from(tipCandidates)
    .innerJoin(tipArticles, eq(tipArticles.id, tipCandidates.articleId))
    .where(and(where, eq(tipCandidates.verdict, 'tip')))
    .orderBy(desc(tipCandidates.createdAt));
}

/** Titles/urls for cited corpus documents — a read-only lookup on `documents`. */
async function documentLabels(
  ids: number[],
): Promise<Map<number, { title: string; url: string | null }>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb().execute(
    sql`SELECT id, title, url FROM documents WHERE id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`,
  );
  return new Map(
    (rows.rows as Array<{ id: number; title: string; url: string | null }>).map((r) => [
      Number(r.id),
      { title: r.title, url: r.url },
    ]),
  );
}

export async function listCandidates(
  status: 'open' | 'sent' | 'dismissed',
  cadenceFor: (reporterId: string) => string,
): Promise<DigestCandidate[]> {
  const rows = await candidateRows(eq(tipCandidates.status, status));
  const labels = await documentLabels([
    ...new Set(rows.map((r) => r.tipDocumentId).filter((x): x is number => x != null)),
  ]);
  return rows
    .filter((r): r is CandidateJoin & { tip: TipPayload } => r.tip !== null)
    .map((r) => ({
      ...r,
      reporterName: getReporter(r.reporterId)?.name ?? r.reporterId,
      docTitle: r.tipDocumentId != null ? (labels.get(r.tipDocumentId)?.title ?? null) : null,
      docUrl: r.tipDocumentId != null ? (labels.get(r.tipDocumentId)?.url ?? null) : null,
      cadence: cadenceFor(r.reporterId),
    }));
}

export async function listUnrepliedSent(minAgeDays: number): Promise<ReminderRow[]> {
  const rows = await getDb()
    .select({
      candidateId: tipSentLog.candidateId,
      reporterId: tipSentLog.reporterId,
      sentAt: tipSentLog.sentAt,
      title: tipArticles.title,
    })
    .from(tipSentLog)
    .innerJoin(tipCandidates, eq(tipCandidates.id, tipSentLog.candidateId))
    .innerJoin(tipArticles, eq(tipArticles.id, tipCandidates.articleId))
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
      reporterId: tipArticles.reporterId,
      status: tipCandidates.status,
    })
    .from(tipCandidates)
    .innerJoin(tipArticles, eq(tipArticles.id, tipCandidates.articleId))
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
