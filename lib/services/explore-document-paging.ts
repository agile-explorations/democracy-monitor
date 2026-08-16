/**
 * Document-level pagination for Explore (#728): the corpus stores one row per
 * document-CATEGORY pair, so row-level counts and OFFSETs miscounted ("118
 * results" for 7 documents) and could split one document's category rows
 * across a page boundary, silently dropping categories from its card. All
 * three explore paths now order and page over unique documents (keyed by URL,
 * falling back to row id for URL-less docs), then fetch EVERY category row
 * for the paged documents.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

type Db = ReturnType<typeof getDb>;
type SqlChunk = ReturnType<typeof sql>;

/** Stable identity for a document across its category rows. Mirrors the UI's
 *  card grouping (ExploreResults groupByUrl). */
export function docKey(url: string | null, id: number): string {
  return url ?? `_id_${id}`;
}

/** SQL twin of docKey, for filtering rows by paged document keys. */
const DOC_KEY_SQL = sql`COALESCE(d.url, '_id_' || d.id::text)`;

/** Collapse an ORDERED row list to unique document keys, first occurrence
 *  winning — so a document's best-ranked row defines its position. Pure. */
export function orderedUniqueDocKeys(rows: Array<{ id: number; url: string | null }>): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const row of rows) {
    const key = docKey(row.url, row.id);
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/**
 * Fetch every category row for the paged documents, preserving page order
 * (rows of the same document stay adjacent, in the document's page position).
 * whereClause keeps the search's filters binding — a category filter still
 * excludes a document's other-category rows, matching pre-#728 behavior.
 */
export async function fetchRowsForDocKeys(
  db: Db,
  keys: string[],
  whereClause: SqlChunk,
  vectorStr: string | null,
  query: string,
): Promise<Record<string, unknown>[]> {
  if (keys.length === 0) return [];
  const cosineExpr = vectorStr ? sql`1 - (d.embedding <=> ${vectorStr}::vector)` : sql`NULL::float`;
  const textRankExpr = query.trim()
    ? sql`ts_rank_cd(d.search_vector, websearch_to_tsquery('english', ${query}))`
    : sql`NULL::float`;
  const results = await db.execute(sql`
    SELECT d.id, d.title, d.url, d.published_at, d.source_type, d.source_origin, d.category, d.case_id,
      LEFT(d.content, 250) as snippet,
      ${cosineExpr} as cosine_similarity,
      ${textRankExpr} as text_rank,
      ds.severity_score, ds.final_score, ds.document_class, ds.class_multiplier,
      ds.capture_count, ds.drift_count, ds.warning_count, ds.suppressed_count,
      ds.matches, ds.suppressed
    FROM documents d
    LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
    WHERE ${whereClause} AND ${DOC_KEY_SQL} IN (${sql.join(
      keys.map((k) => sql`${k}`),
      sql`, `,
    )})`);
  const rows = results.rows as Record<string, unknown>[];
  const order = new Map(keys.map((k, i) => [k, i]));
  return rows.sort(
    (a, b) =>
      (order.get(docKey(a.url as string | null, Number(a.id))) ?? 0) -
      (order.get(docKey(b.url as string | null, Number(b.id))) ?? 0),
  );
}

/** Distinct-document count for a filtered scan (text path — the only path
 *  whose candidate set is not already in memory). */
export async function countDistinctDocs(db: Db, whereClause: SqlChunk): Promise<number> {
  const countResult = await db.execute(sql`
    SELECT count(DISTINCT ${DOC_KEY_SQL}) as total
    FROM documents d
    LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
    WHERE ${whereClause}`);
  return Number((countResult.rows[0] as { total: string }).total);
}

/**
 * Page of document keys straight from SQL (text path): DISTINCT ON picks each
 * document's best row under the sort, then the outer sort orders documents.
 */
export async function pageDocKeysBySql(
  db: Db,
  whereClause: SqlChunk,
  sortCol: SqlChunk,
  sortDir: 'ASC' | 'DESC',
  pageSize: number,
  offset: number,
): Promise<string[]> {
  const dir = sortDir === 'DESC' ? sql`DESC` : sql`ASC`;
  const results = await db.execute(sql`
    SELECT key FROM (
      SELECT DISTINCT ON (${DOC_KEY_SQL}) ${DOC_KEY_SQL} as key, ${sortCol} as sort_val
      FROM documents d
      LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
      WHERE ${whereClause}
      ORDER BY ${DOC_KEY_SQL}, ${sortCol} ${dir} NULLS LAST
    ) u
    ORDER BY sort_val ${dir} NULLS LAST
    LIMIT ${pageSize} OFFSET ${offset}`);
  return (results.rows as Array<{ key: string }>).map((r) => r.key);
}
