/**
 * R-TIPWIRE digest reads (#858; split from ./store for the size limit):
 * open/sent/dismissed tip candidates joined to their article, cited
 * document, listed reporters and per-reporter send state. Read-only on
 * documents (title/url lookup only).
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { tipArticles, tipCandidates, tipSentLog } from '@/lib/db/schema';
import type { TipCoverageCheck, TipPayload } from '@/lib/db/schema';
import type { DigestCandidate, DigestReporter } from './digest';
import { categoryLabel, getReporter } from './roster';
import type { CategoryKey } from './roster';

interface CandidateJoin {
  id: number;
  reporterId: string;
  reporterIds: string[] | null;
  beatCategory: string | null;
  outlet: string | null;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  ledeSource: string | null;
  coauthorCount: number | null;
  reactive: boolean;
  kind: string;
  coverage: TipCoverageCheck | null;
  tip: TipPayload | null;
  tipDocumentId: number | null;
  sinceAt: Date | null;
  createdAt: Date;
}

async function candidateRows(where: ReturnType<typeof eq>): Promise<CandidateJoin[]> {
  return getDb()
    .select({
      id: tipCandidates.id,
      reporterId: sql<string>`COALESCE(${tipCandidates.reporterId}, ${tipArticles.reporterId})`,
      reporterIds: tipCandidates.reporterIds,
      beatCategory: tipCandidates.beatCategory,
      outlet: tipArticles.outlet,
      title: tipArticles.title,
      url: tipArticles.url,
      publishedAt: tipArticles.publishedAt,
      ledeSource: tipArticles.ledeSource,
      coauthorCount: tipArticles.coauthorCount,
      reactive: tipCandidates.reactive,
      kind: tipCandidates.watchKind,
      coverage: tipCandidates.coverageCheck,
      tip: tipCandidates.tip,
      tipDocumentId: tipCandidates.tipDocumentId,
      sinceAt: tipCandidates.sinceAt,
      createdAt: tipCandidates.createdAt,
    })
    .from(tipCandidates)
    .leftJoin(tipArticles, eq(tipArticles.id, tipCandidates.articleId))
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

/** Newest send per (candidate, reporter), keyed `${candidateId}:${reporterId}`. */
async function sentAtByReporter(candidateIds: number[]): Promise<Map<string, Date>> {
  if (candidateIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      candidateId: tipSentLog.candidateId,
      reporterId: tipSentLog.reporterId,
      sentAt: tipSentLog.sentAt,
    })
    .from(tipSentLog)
    .where(inArray(tipSentLog.candidateId, candidateIds))
    .orderBy(desc(tipSentLog.sentAt));
  const out = new Map<string, Date>();
  for (const r of rows) {
    const key = `${r.candidateId}:${r.reporterId}`;
    if (!out.has(key)) out.set(key, r.sentAt);
  }
  return out;
}

/** Every reporter the row lists (beat rows since 0070), else the single anchor reporter. */
export function listedReporterIds(
  row: Pick<CandidateJoin, 'reporterId' | 'reporterIds'>,
): string[] {
  return row.reporterIds && row.reporterIds.length > 0 ? row.reporterIds : [row.reporterId];
}

function digestReporter(
  candidateId: number,
  id: string,
  cadenceFor: (reporterId: string) => string,
  sent: Map<string, Date>,
): DigestReporter {
  const r = getReporter(id);
  return {
    id,
    name: r?.name ?? id,
    outlet: r?.outlet ?? id,
    outletDomain: r?.outletDomain ?? '',
    cadence: cadenceFor(id),
    sentAt: sent.get(`${candidateId}:${id}`) ?? null,
  };
}

export async function listCandidates(
  status: 'open' | 'sent' | 'dismissed',
  cadenceFor: (reporterId: string) => string,
): Promise<DigestCandidate[]> {
  const rows = await candidateRows(eq(tipCandidates.status, status));
  const labels = await documentLabels([
    ...new Set(rows.map((r) => r.tipDocumentId).filter((x): x is number => x != null)),
  ]);
  const sent = await sentAtByReporter(rows.map((r) => r.id));
  return rows
    .filter((r): r is CandidateJoin & { tip: TipPayload } => r.tip !== null)
    .map((r) => ({
      ...r,
      // Beat-pass rows (no article) render from the roster entry (#868).
      outlet: r.outlet ?? getReporter(r.reporterId)?.outlet ?? r.reporterId,
      title:
        r.title ??
        `Beat check — ${r.beatCategory ? `${categoryLabel(r.beatCategory as CategoryKey)} · ` : ''}week of ${r.sinceAt?.toISOString().slice(0, 10) ?? '?'}`,
      ledeSource: r.ledeSource ?? 'beat',
      coauthorCount: r.coauthorCount ?? 0,
      kind: (r.kind === 'contradiction' || r.kind === 'beat'
        ? r.kind
        : 'forward') as DigestCandidate['kind'],
      reporterName: getReporter(r.reporterId)?.name ?? r.reporterId,
      reporters: listedReporterIds(r).map((id) => digestReporter(r.id, id, cadenceFor, sent)),
      docTitle: r.tipDocumentId != null ? (labels.get(r.tipDocumentId)?.title ?? null) : null,
      docUrl: r.tipDocumentId != null ? (labels.get(r.tipDocumentId)?.url ?? null) : null,
      cadence: cadenceFor(r.reporterId),
    }));
}
