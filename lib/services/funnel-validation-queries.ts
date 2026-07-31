/**
 * DB queries for the per-source funnel diagnostic (#547), grouped by
 * (category, source_origin) over a mandatory time window.
 *
 * DETOAST SAFETY: `documents.content` is a ~6GB TOASTed column; referencing
 * `length(content)` in an UNBOUNDED aggregate hangs the query
 * (see pages/api/stats/document-count.ts). Every query here is bounded by a
 * `published_at` window, which keeps the detoast set to a period slice — the
 * same safe envelope data-validation-queries.ts uses. The window is mandatory;
 * never call these with an open-ended range.
 */

import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { aiDocumentAssessments, documents, frDropLedger } from '@/lib/db/schema';

const MONITORING_KEYS = CATEGORIES.map((c) => c.key);

export interface RetrievedRow {
  category: string;
  sourceOrigin: string | null;
  retrieved: number;
  passedRelevance: number;
}
export interface FrDropRow {
  category: string;
  dropped: number;
}
export interface StageCountRow {
  category: string;
  sourceOrigin: string | null;
  count: number;
}

function categoryFilter(column: typeof documents.category, category?: string) {
  return category ? eq(column, category) : inArray(column, MONITORING_KEYS);
}

/**
 * Q1 — RETRIEVED + PASSED RELEVANCE per (category, source_origin) from a single
 * `documents` scan. RETRIEVED counts all content-eligible docs regardless of
 * `retrieval_relevant`; PASSED filters to `retrieval_relevant IS NOT FALSE`.
 * The windowed `length(content) >= 100` is detoast-safe (see file header).
 */
export async function queryRetrievedAndPassed(
  from: string,
  to: string,
  category?: string,
): Promise<RetrievedRow[]> {
  const db = getDb();
  const eligible = and(
    gte(documents.publishedAt, new Date(from)),
    lt(documents.publishedAt, new Date(to)),
    categoryFilter(documents.category, category),
    sql`${documents.contentType} != 'metadata_only'`,
    sql`${documents.content} is not null`,
    sql`length(${documents.content}) >= 100`,
  );

  return db
    .select({
      category: documents.category,
      sourceOrigin: documents.sourceOrigin,
      retrieved: sql<number>`count(distinct ${documents.url})::int`,
      passedRelevance: sql<number>`count(distinct ${documents.url}) filter (where ${documents.retrievalRelevant} is not false)::int`,
    })
    .from(documents)
    .where(eligible)
    .groupBy(documents.category, documents.sourceOrigin);
}

/**
 * Q2 — FR live-drops per category from `fr_drop_ledger`. Load-bearing: post-#524
 * contaminated FR docs are live-dropped into the ledger and never stored as
 * `documents`, so RETRIEVED would undercount without this. Attributed to
 * source_origin 'federal_register' and added to RETRIEVED only (never PASSED —
 * ledger rows are by definition relevance-dropped).
 *
 * Counts ONLY ledger rows absent from `documents` (via NOT EXISTS): the
 * historical-annotation path stores its drops as `retrieval_relevant = false`
 * AND ledgers them, so those are already in Q1's RETRIEVED — the anti-join
 * prevents double-counting, leaving just the never-stored live-drops.
 */
export async function queryFrDrops(
  from: string,
  to: string,
  category?: string,
): Promise<FrDropRow[]> {
  const db = getDb();
  const where = and(
    gte(frDropLedger.publishedAt, from),
    lt(frDropLedger.publishedAt, to),
    category ? eq(frDropLedger.category, category) : undefined,
    sql`not exists (select 1 from ${documents} d where d.url = ${frDropLedger.url} and d.category = ${frDropLedger.category})`,
  );

  return db
    .select({
      category: frDropLedger.category,
      dropped: sql<number>`count(distinct ${frDropLedger.url})::int`,
    })
    .from(frDropLedger)
    .where(where)
    .groupBy(frDropLedger.category);
}

/**
 * Q3 — P1 FLAGGED per (category, source_origin). Assessments carry no
 * source_origin and `document_id` is always NULL, so join `documents` on
 * (url, category) — that both attributes the origin and bounds the window.
 */
export async function queryP1Flagged(
  from: string,
  to: string,
  category?: string,
): Promise<StageCountRow[]> {
  const db = getDb();
  return db
    .select({
      category: documents.category,
      sourceOrigin: documents.sourceOrigin,
      count: sql<number>`count(distinct ${aiDocumentAssessments.url}) filter (where ${aiDocumentAssessments.relevant} = true)::int`,
    })
    .from(aiDocumentAssessments)
    .innerJoin(
      documents,
      and(
        eq(documents.url, aiDocumentAssessments.url),
        eq(documents.category, aiDocumentAssessments.category),
      ),
    )
    .where(
      and(
        eq(aiDocumentAssessments.pass, 1),
        gte(documents.publishedAt, new Date(from)),
        lt(documents.publishedAt, new Date(to)),
        sql`${documents.contentType} != 'metadata_only'`,
        categoryFilter(documents.category, category),
      ),
    )
    .groupBy(documents.category, documents.sourceOrigin);
}

/**
 * Q4 — P2 CONFIRMED (potentially/clearly concerning) per (category,
 * source_origin), excluding audit samples. Same join path as Q3.
 */
export async function queryP2Confirmed(
  from: string,
  to: string,
  category?: string,
): Promise<StageCountRow[]> {
  const db = getDb();
  return db
    .select({
      category: documents.category,
      sourceOrigin: documents.sourceOrigin,
      count: sql<number>`count(distinct ${aiDocumentAssessments.url}) filter (where ${aiDocumentAssessments.assessment} in ('potentially_concerning', 'clearly_concerning'))::int`,
    })
    .from(aiDocumentAssessments)
    .innerJoin(
      documents,
      and(
        eq(documents.url, aiDocumentAssessments.url),
        eq(documents.category, aiDocumentAssessments.category),
      ),
    )
    .where(
      and(
        eq(aiDocumentAssessments.pass, 2),
        eq(aiDocumentAssessments.isAuditSample, false),
        gte(documents.publishedAt, new Date(from)),
        lt(documents.publishedAt, new Date(to)),
        sql`${documents.contentType} != 'metadata_only'`,
        categoryFilter(documents.category, category),
      ),
    )
    .groupBy(documents.category, documents.sourceOrigin);
}
