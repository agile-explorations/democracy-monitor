/**
 * Revised-opinion dedup (#741). CourtListener creates a SECOND cluster when a
 * slip opinion is revised; the new cluster's sub-opinion has a new id, hence
 * a new URL, hence a second `documents` row for the same case, category and
 * decision date — 592 such rows in the corpus on 2026-08-28 (49 SCOTUS). The
 * superseded document row is MARKED, never deleted: `retrieval_relevant =
 * false` (out of search and evidence), `counting_scope = false` where it was
 * in scope (out of the weekly count), and `metadata.supersededBy` pointing
 * at the surviving URL. Its derived rows (score, AI review) are removed —
 * the keeper revision carries its own — so status counts stop double-
 * counting and the derivation graph (G5/G1b) stays consistent.
 *
 * Pure selection (`pickSuperseded`) + one I/O marker shared by the fetchers
 * (forward, keeper = the row just stored) and the one-time
 * `cl:dedupe-revisions` runbook (existing rows, keeper = latest fetched).
 */

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { retrievalRelevantOnly } from '@/lib/db/document-filters';
import { aiDocumentAssessments, documents, documentScores } from '@/lib/db/schema';
import { addDays } from '@/lib/utils/date-utils';

export interface OpinionRowRef {
  id: number;
  url: string;
  /** Row order proxy: the later-fetched (or higher-id) row is the revision. */
  fetchedAt: string | null;
  countingScope: boolean | null;
}

export interface RevisionSplit {
  keeper: OpinionRowRef | null;
  superseded: OpinionRowRef[];
}

/** Split rows for one (case, category, decision date) into the keeper and
 *  the superseded rest. Keeper = the explicit `keepUrl` when present (the row
 *  just stored), else the latest fetched, ties broken by highest id. */
export function pickSuperseded(rows: OpinionRowRef[], keepUrl?: string): RevisionSplit {
  if (rows.length < 2) return { keeper: rows[0] ?? null, superseded: [] };
  const keeper =
    (keepUrl ? rows.find((r) => r.url === keepUrl) : undefined) ??
    [...rows].sort(
      (a, b) => (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? '') || b.id - a.id,
    )[0];
  return { keeper, superseded: rows.filter((r) => r.url !== keeper.url) };
}

export interface SupersededMark {
  id: number;
  url: string;
  category: string;
  supersededBy: string;
}

/** All live opinion rows for one case + category on one decision day. */
async function loadSameDayOpinions(
  caseId: string,
  category: string,
  dateFiled: string,
): Promise<OpinionRowRef[]> {
  const rows = await getDb()
    .select({
      id: documents.id,
      url: documents.url,
      fetchedAt: documents.fetchedAt,
      countingScope: documents.countingScope,
    })
    .from(documents)
    .where(
      and(
        eq(documents.caseId, caseId),
        eq(documents.category, category),
        eq(documents.sourceType, 'judicial_opinion'),
        gte(documents.publishedAt, new Date(dateFiled)),
        lt(documents.publishedAt, new Date(addDays(dateFiled, 1))),
        // IS NOT FALSE — most rows are NULL, and `<> false` would drop them.
        retrievalRelevantOnly(),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    url: r.url ?? '',
    fetchedAt: r.fetchedAt ? r.fetchedAt.toISOString() : null,
    countingScope: r.countingScope,
  }));
}

/** Out of search/evidence and (if in scope) out of the weekly count; the
 *  keeper's URL is recorded so the mark is auditable and reversible. The
 *  row's derived rows (score + AI review) are removed in the same
 *  transaction — the retrieval-relevance annotation's own cascade (#544):
 *  status counts read assessments without joining documents, so a superseded
 *  verdict would keep double-counting, and G5/G1b forbid derived rows on a
 *  retrieval-excluded document. The keeper revision carries its own review. */
async function applySupersededMark(
  row: OpinionRowRef,
  category: string,
  keeperUrl: string,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx
      .update(documents)
      .set({
        retrievalRelevant: false,
        ...(row.countingScope ? { countingScope: false } : {}),
        metadata: sql`coalesce(${documents.metadata}, '{}'::jsonb) || ${JSON.stringify({ supersededBy: keeperUrl })}::jsonb`,
      })
      .where(eq(documents.id, row.id));
    await cascadeDerivedRows(tx, row.url, category);
  });
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** Derived rows key on (url, category). */
async function cascadeDerivedRows(tx: Tx, url: string, category: string): Promise<void> {
  await tx
    .delete(documentScores)
    .where(and(eq(documentScores.url, url), eq(documentScores.category, category)));
  await tx
    .delete(aiDocumentAssessments)
    .where(and(eq(aiDocumentAssessments.url, url), eq(aiDocumentAssessments.category, category)));
}

/** Runbook repair for rows marked before the cascade existed: remove the
 *  derived rows of every superseded document. Idempotent. */
export async function cascadeSupersededDerivedRows(
  dryRun: boolean,
): Promise<{ docs: number; scores: number; assessments: number }> {
  if (!isDbAvailable()) return { docs: 0, scores: 0, assessments: 0 };
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT d.url, d.category,
      (SELECT count(*) FROM document_scores s WHERE s.url = d.url AND s.category = d.category) AS scores,
      (SELECT count(*) FROM ai_document_assessments a WHERE a.url = d.url AND a.category = d.category) AS assessments
    FROM documents d WHERE d.metadata ? 'supersededBy'`);
  const targets = (
    rows.rows as Array<{ url: string; category: string; scores: string; assessments: string }>
  ).filter((r) => Number(r.scores) + Number(r.assessments) > 0);
  const totals = {
    docs: targets.length,
    scores: targets.reduce((n, r) => n + Number(r.scores), 0),
    assessments: targets.reduce((n, r) => n + Number(r.assessments), 0),
  };
  if (dryRun) return totals;
  await db.transaction(async (tx) => {
    for (const t of targets) await cascadeDerivedRows(tx, t.url, t.category);
  });
  return totals;
}

/**
 * Mark the superseded revisions of one opinion. `dateFiled` is the cluster's
 * decision date (YYYY-MM-DD); rows are matched on the same calendar day so a
 * later merits opinion on the same docket is never mistaken for a revision.
 * Omit `keepUrl` to keep the latest-fetched row (the runbook's rule).
 */
export async function markSupersededRevisions(
  caseId: string,
  category: string,
  dateFiled: string,
  keepUrl?: string,
  dryRun = false,
): Promise<SupersededMark[]> {
  if (!isDbAvailable()) return [];
  const rows = await loadSameDayOpinions(caseId, category, dateFiled);
  const { keeper, superseded } = pickSuperseded(rows, keepUrl);
  if (!keeper) return [];
  const marks = superseded.map((r) => ({
    id: r.id,
    url: r.url,
    category,
    supersededBy: keeper.url,
  }));
  if (dryRun) return marks;
  for (const r of superseded) await applySupersededMark(r, category, keeper.url);
  return marks;
}
