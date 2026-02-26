import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import type { ContentItem } from '@/lib/types';
import { toDateString } from '@/lib/utils/date-utils';

export function buildMetadata(item: ContentItem): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {};
  if (item.agency) meta.agency = item.agency;
  if (item.action) meta.action = item.action;
  if (item.subtype) meta.subtype = item.subtype;
  if (item.metadata) Object.assign(meta, item.metadata);
  return Object.keys(meta).length > 0 ? meta : null;
}

/** FR document types that map to federal_register origin. */
const FR_DOC_TYPES = new Set([
  'Notice',
  'Rule',
  'Proposed Rule',
  'Presidential Document',
  'executive_order',
  'presidential_memorandum',
  'proclamation',
  'presidential_notice',
  'final_rule',
  'proposed_rule',
  'notice',
]);

/** Infer sourceOrigin from item type for backward compatibility. */
export function inferSourceOrigin(item: ContentItem): string | null {
  const t = item.type ?? '';
  if (FR_DOC_TYPES.has(t)) return 'federal_register';
  if (t === 'press_release') return 'doj';
  if (t === 'court_opinion' || t === 'docket_entry') return 'courtlistener';
  return null;
}

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
          metadata: buildMetadata(item),
          sourceOrigin: item.sourceOrigin || inferSourceOrigin(item),
        })
        .onConflictDoUpdate({
          target: [documents.url, documents.category],
          set: {
            title: sql`excluded.title`,
            content: sql`excluded.content`,
            fetchedAt: sql`excluded.fetched_at`,
            metadata: sql`excluded.metadata`,
            sourceOrigin: sql`excluded.source_origin`,
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

/** Check if documents from a given source already exist for a category+week. */
export async function countWeekDocsBySource(
  sourceOrigin: string,
  category: string,
  weekStart: string,
  weekEnd: string,
): Promise<number> {
  if (!isDbAvailable()) return 0;
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.sourceOrigin, sourceOrigin),
        eq(documents.category, category),
        gte(documents.publishedAt, new Date(weekStart)),
        lt(documents.publishedAt, new Date(weekEnd)),
      ),
    );
  return rows[0]?.count ?? 0;
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
