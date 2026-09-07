/**
 * R-TIPWIRE standing watches (#862): which stored articles are still being
 * followed forward, and when each was last checked. Read-only on documents.
 */

import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { tipArticles } from '@/lib/db/schema';
import type { DiscoveredArticle } from './acquire';

export interface OpenWatch {
  id: number;
  article: DiscoveredArticle;
  lastCheckedAt: Date | null;
  /** Corpus documents already cited for this article — never re-proposed. */
  citedDocIds: number[];
}

/** Standing watches: dated articles whose watch_until is still ahead, oldest check first. */
export async function listOpenWatches(now: Date): Promise<OpenWatch[]> {
  const rows = await getDb()
    .select({
      id: tipArticles.id,
      reporterId: tipArticles.reporterId,
      outlet: tipArticles.outlet,
      articleKey: tipArticles.articleKey,
      url: tipArticles.url,
      title: tipArticles.title,
      lede: tipArticles.lede,
      ledeSource: tipArticles.ledeSource,
      publishedAt: tipArticles.publishedAt,
      feedStrategy: tipArticles.feedStrategy,
      attribution: tipArticles.attribution,
      coauthorCount: tipArticles.coauthorCount,
      rawMeta: tipArticles.rawMeta,
      lastCheckedAt: tipArticles.lastCheckedAt,
      citedDocIds: sql<
        number[]
      >`ARRAY(SELECT c.tip_document_id FROM tip_candidates c WHERE c.article_id = ${tipArticles.id} AND c.tip_document_id IS NOT NULL)`,
    })
    .from(tipArticles)
    .where(sql`${tipArticles.watchUntil} > ${now}`)
    .orderBy(sql`${tipArticles.lastCheckedAt} NULLS FIRST`, desc(tipArticles.publishedAt));
  return rows.map((r) => ({
    id: r.id,
    lastCheckedAt: r.lastCheckedAt,
    citedDocIds: (r.citedDocIds ?? []).map(Number),
    article: {
      reporterId: r.reporterId,
      outlet: r.outlet,
      articleKey: r.articleKey,
      url: r.url,
      title: r.title,
      lede: r.lede,
      ledeSource: r.ledeSource as DiscoveredArticle['ledeSource'],
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      feedStrategy: r.feedStrategy as DiscoveredArticle['feedStrategy'],
      attribution: r.attribution,
      coauthorCount: r.coauthorCount,
      rawMeta: r.rawMeta ?? {},
    },
  }));
}

export async function touchWatch(articleId: number, checkedAt: Date): Promise<void> {
  await getDb()
    .update(tipArticles)
    .set({ lastCheckedAt: checkedAt })
    .where(eq(tipArticles.id, articleId));
}
