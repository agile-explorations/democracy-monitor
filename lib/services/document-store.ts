import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import type { ContentItem } from '@/lib/types';
import { toDateString } from '@/lib/utils/date-utils';

/**
 * Upsert documents from feed items into the database for RAG retrieval.
 * No-op when DATABASE_URL is not configured.
 */
export async function storeDocuments(items: ContentItem[], category: string): Promise<number> {
  if (!isDbAvailable()) return 0;

  const db = getDb();
  let stored = 0;

  const validItems = items.filter((item) => !item.isError && !item.isWarning && item.link);

  for (const item of validItems) {
    try {
      await db
        .insert(documents)
        .values({
          sourceType: item.type || 'rss',
          category,
          title: item.title || '(untitled)',
          content: item.summary || null,
          url: item.link!,
          publishedAt: item.pubDate ? new Date(item.pubDate) : null,
          fetchedAt: new Date(),
          metadata: item.agency ? { agency: item.agency } : null,
        })
        .onConflictDoUpdate({
          target: documents.url,
          set: {
            title: sql`excluded.title`,
            content: sql`excluded.content`,
            fetchedAt: sql`excluded.fetched_at`,
            metadata: sql`excluded.metadata`,
          },
        });
      stored++;
    } catch (err) {
      console.error(`Failed to store document ${item.link}:`, err);
    }
  }

  return stored;
}

/**
 * Get documents for a category within a date range.
 */
export async function getDocumentHistory(
  category: string,
  options?: { from?: string; to?: string; limit?: number },
): Promise<
  {
    id: number;
    title: string;
    url: string | null;
    publishedAt: Date | null;
    sourceType: string;
    category: string;
  }[]
> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const conditions = [eq(documents.category, category)];
  if (options?.from) conditions.push(gte(documents.publishedAt, new Date(options.from)));
  if (options?.to) conditions.push(lte(documents.publishedAt, new Date(options.to)));

  return db
    .select({
      id: documents.id,
      title: documents.title,
      url: documents.url,
      publishedAt: documents.publishedAt,
      sourceType: documents.sourceType,
      category: documents.category,
    })
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.publishedAt))
    .limit(options?.limit || 500);
}

export interface VolumePoint {
  week: string;
  count: number;
}

/**
 * Get weekly document volume per category within a date range.
 */
export async function getDocumentVolume(options?: {
  from?: string;
  to?: string;
}): Promise<Record<string, VolumePoint[]>> {
  if (!isDbAvailable()) return {};
  const db = getDb();

  const fromClause = options?.from ? sql`AND published_at >= ${new Date(options.from)}` : sql``;
  const toClause = options?.to ? sql`AND published_at <= ${new Date(options.to)}` : sql``;

  const rows = await db.execute(sql`
    SELECT
      category,
      date_trunc('week', published_at) AS week,
      COUNT(*)::int AS count
    FROM documents
    WHERE published_at IS NOT NULL ${fromClause} ${toClause}
    GROUP BY category, date_trunc('week', published_at)
    ORDER BY category, week
  `);

  const result: Record<string, VolumePoint[]> = {};
  for (const row of rows.rows) {
    const r = row as Record<string, unknown>;
    const cat = r.category as string;
    if (!result[cat]) result[cat] = [];
    result[cat].push({
      week: toDateString(new Date(r.week as string)),
      count: r.count as number,
    });
  }
  return result;
}
