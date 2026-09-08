/**
 * R-TIPWIRE-3 coverage persistence (#861, #866): backfill support for open
 * tip candidates created before the check existed or while GDELT was
 * unavailable. Read-only on documents.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { tipArticles, tipCandidates } from '@/lib/db/schema';
import type { TipCoverageCheck, TipPayload } from '@/lib/db/schema';

export interface CoverageBackfillRow {
  id: number;
  reporterId: string;
  searchKeys: string[];
}

/** Open tip candidates with no coverage check yet (or one specific candidate). */
export async function listOpenTipsLackingCoverage(
  candidateId?: number,
): Promise<CoverageBackfillRow[]> {
  const where = candidateId
    ? eq(tipCandidates.id, candidateId)
    : and(
        eq(tipCandidates.status, 'open'),
        eq(tipCandidates.verdict, 'tip'),
        isNull(tipCandidates.coverageCheck),
      );
  const rows = await getDb()
    .select({
      id: tipCandidates.id,
      reporterId: sql<string>`COALESCE(${tipCandidates.reporterId}, ${tipArticles.reporterId})`,
      tip: tipCandidates.tip,
    })
    .from(tipCandidates)
    .leftJoin(tipArticles, eq(tipArticles.id, tipCandidates.articleId))
    .where(where)
    .orderBy(tipCandidates.id);
  return rows.map((r) => ({
    id: r.id,
    reporterId: r.reporterId,
    searchKeys: (r.tip as TipPayload | null)?.searchKeys ?? [],
  }));
}

export async function updateCoverageCheck(id: number, check: TipCoverageCheck): Promise<void> {
  await getDb().update(tipCandidates).set({ coverageCheck: check }).where(eq(tipCandidates.id, id));
}
