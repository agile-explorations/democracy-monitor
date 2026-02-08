import { sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import type { ContentItem } from '@/lib/types';

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
