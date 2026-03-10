/**
 * Research mode query helpers — corpus-wide statistics via embedding similarity.
 *
 * Separated from search-service.ts to keep that file under ESLint max-lines.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CorpusStats {
  totalMatching: number;
  monthlyBreakdown: { month: string; count: number }[];
  categoryBreakdown: { category: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Corpus-wide statistics
// ---------------------------------------------------------------------------

/**
 * Count all documents semantically similar to the query across the full corpus.
 *
 * Uses the same embedding that powers document retrieval, so corpus stats and
 * retrieved documents are measured on the same semantic scale. The distance
 * threshold is adaptive — derived from the least similar retrieved document,
 * so "matching" means "at least as relevant as what we showed the user."
 *
 * @param embedding - Pre-computed query embedding (reused from searchResearch)
 * @param maxDistance - Cosine distance threshold (1 - similarity of least similar retrieved doc)
 */
export async function searchCorpusStats(
  embedding: number[],
  maxDistance: number,
): Promise<CorpusStats | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();
  const vectorStr = `[${embedding.join(',')}]`;

  try {
    const [monthlyResult, categoryResult] = await Promise.all([
      db.execute(sql`
        SELECT to_char(date_trunc('month', published_at), 'YYYY-MM') as month,
          count(*)::int as count
        FROM documents
        WHERE embedding IS NOT NULL
          AND (embedding <=> ${vectorStr}::vector) < ${maxDistance}
          AND published_at IS NOT NULL
          AND source_origin NOT IN ('gdelt', 'whitehouse')
        GROUP BY date_trunc('month', published_at)
        ORDER BY month
      `),
      db.execute(sql`
        SELECT category, count(*)::int as count
        FROM documents
        WHERE embedding IS NOT NULL
          AND (embedding <=> ${vectorStr}::vector) < ${maxDistance}
          AND source_origin NOT IN ('gdelt', 'whitehouse')
        GROUP BY category
        ORDER BY count DESC
      `),
    ]);

    const monthly = (monthlyResult.rows as { month: string; count: number }[]).map((r) => ({
      month: r.month,
      count: Number(r.count),
    }));
    const categories = (categoryResult.rows as { category: string; count: number }[]).map((r) => ({
      category: r.category,
      count: Number(r.count),
    }));

    return {
      totalMatching: categories.reduce((sum, c) => sum + c.count, 0),
      monthlyBreakdown: monthly,
      categoryBreakdown: categories,
    };
  } catch (err) {
    console.error('[search] Corpus stats query failed:', err);
    return null;
  }
}
