import { sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { embedText } from './embedding-service';

export interface RetrievedDocument {
  title: string;
  content: string | null;
  url: string | null;
  similarity: number;
  publishedAt: Date | null;
}

/**
 * Retrieve documents most relevant to a query using pgvector cosine distance.
 * Returns empty array when DB, embeddings, or pgvector are unavailable.
 */
export async function retrieveRelevantDocuments(
  query: string,
  categories: string | string[],
  topK = 5,
): Promise<RetrievedDocument[]> {
  if (!isDbAvailable()) return [];

  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return [];

  const db = getDb();
  const vectorStr = `[${queryEmbedding.join(',')}]`;
  const categoryArray = Array.isArray(categories) ? categories : [categories];
  const categoryList = sql.join(
    categoryArray.map((c) => sql`${c}`),
    sql`, `,
  );

  try {
    const results = await db.execute(
      sql`SELECT title, content, url, published_at,
            1 - (embedding <=> ${vectorStr}::vector) as similarity
          FROM documents
          WHERE category IN (${categoryList})
            AND embedding IS NOT NULL
          ORDER BY embedding <=> ${vectorStr}::vector
          LIMIT ${topK}`,
    );

    return (results.rows as Record<string, unknown>[]).map((row) => ({
      title: row.title as string,
      content: row.content as string | null,
      url: row.url as string | null,
      similarity: row.similarity as number,
      publishedAt: row.published_at ? new Date(row.published_at as string) : null,
    }));
  } catch (err) {
    console.error(`Document retrieval failed for ${categoryArray.join(',')}:`, err);
    return [];
  }
}
