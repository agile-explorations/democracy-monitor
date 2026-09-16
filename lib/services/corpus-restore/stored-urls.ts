/**
 * Anti-join queries for the corpus restore (#894): which of a candidate set
 * already has a `documents` row. Keyed by URL (the natural key with
 * category) or by a source identifier kept in `documents.metadata`.
 */
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { chunk } from '@/lib/utils/collections';

const QUERY_CHUNK_SIZE = 500;

/**
 * URLs among `urls` that already have a documents row — in `category` when
 * given, in ANY category otherwise (the corpus pseudo-category must not
 * duplicate a document that is routed somewhere).
 */
export async function findStoredUrls(urls: string[], category?: string): Promise<Set<string>> {
  const stored = new Set<string>();
  const db = getDb();
  for (const batch of chunk([...new Set(urls)], QUERY_CHUNK_SIZE)) {
    const scope = category
      ? and(inArray(documents.url, batch), eq(documents.category, category))
      : inArray(documents.url, batch);
    const rows = await db.selectDistinct({ url: documents.url }).from(documents).where(scope);
    for (const row of rows) if (row.url) stored.add(row.url);
  }
  return stored;
}

/**
 * Distinct `metadata->>key` values of stored documents from one source
 * origin, optionally bounded by published_at — the pre-fetch exclusion set
 * for sources whose URL is only known after the fetch (CL, CREC).
 */
export async function getStoredMetadataValues(
  key: string,
  sourceOrigin: string,
  range?: { from: string; to: string },
): Promise<Set<string>> {
  const value = sql<string>`${documents.metadata}->>${key}`;
  const conditions = [eq(documents.sourceOrigin, sourceOrigin), isNotNull(value)];
  if (range) {
    conditions.push(
      sql`${documents.publishedAt} >= ${range.from}::date`,
      sql`${documents.publishedAt} < (${range.to}::date + 1)`,
    );
  }
  const rows = await getDb()
    .selectDistinct({ value })
    .from(documents)
    .where(and(...conditions));
  return new Set(rows.map((r) => r.value));
}
