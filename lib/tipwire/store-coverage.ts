/**
 * R-TIPWIRE-3 coverage persistence (#861, #866): backfill support for open
 * tip candidates created before the check existed, while GDELT was
 * unavailable, or before the own/others split (#874: checks without
 * `hitsByDomain`). Read-only on documents.
 */

import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { tipArticles, tipCandidates } from '@/lib/db/schema';
import type { TipCoverageCheck, TipPayload } from '@/lib/db/schema';

export interface CoverageBackfillRow {
  id: number;
  reporterId: string;
  searchKeys: string[];
  /** The anchor article (null for beat rows) — excluded from its own coverage hits. */
  articleUrl: string | null;
  /** What is stored now; a fresh not-checkable never replaces a real label. */
  existingLabel: TipCoverageCheck['label'] | null;
}

/** A check is worth (re)running when absent, or when no key carries the per-host split. */
export function needsCoverage(check: TipCoverageCheck | null): boolean {
  return !check || !check.keys.some((k) => !k.error && k.hitsByDomain !== undefined);
}

/** Open tip candidates whose coverage is absent or predates the split (or one specific candidate). */
export async function listOpenTipsLackingCoverage(
  candidateId?: number,
): Promise<CoverageBackfillRow[]> {
  const where = candidateId
    ? eq(tipCandidates.id, candidateId)
    : sql`${tipCandidates.status} = 'open' AND ${tipCandidates.verdict} = 'tip'`;
  const rows = await getDb()
    .select({
      id: tipCandidates.id,
      reporterId: sql<string>`COALESCE(${tipCandidates.reporterId}, ${tipArticles.reporterId})`,
      tip: tipCandidates.tip,
      articleUrl: tipArticles.url,
      coverage: tipCandidates.coverageCheck,
    })
    .from(tipCandidates)
    .leftJoin(tipArticles, eq(tipArticles.id, tipCandidates.articleId))
    .where(where)
    .orderBy(tipCandidates.id);
  return rows
    .filter((r) => candidateId !== undefined || needsCoverage(r.coverage))
    .map((r) => ({
      id: r.id,
      reporterId: r.reporterId,
      searchKeys: (r.tip as TipPayload | null)?.searchKeys ?? [],
      articleUrl: r.articleUrl,
      existingLabel: r.coverage?.label ?? null,
    }));
}

export async function updateCoverageCheck(id: number, check: TipCoverageCheck): Promise<void> {
  await getDb().update(tipCandidates).set({ coverageCheck: check }).where(eq(tipCandidates.id, id));
}
