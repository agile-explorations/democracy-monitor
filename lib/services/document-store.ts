import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
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
  if (t === 'court_opinion' || t === 'docket_entry' || t === 'judicial_opinion')
    return 'courtlistener';
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
          caseId: (item.metadata?.caseId as string) ?? item.caseId ?? null,
        })
        .onConflictDoUpdate({
          target: [documents.url, documents.category],
          set: {
            title: sql`excluded.title`,
            content: sql`excluded.content`,
            fetchedAt: sql`excluded.fetched_at`,
            metadata: sql`excluded.metadata`,
            sourceOrigin: sql`excluded.source_origin`,
            caseId: sql`excluded.case_id`,
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
 * Load stored documents for a category+week range, returning ContentItem[] for re-scoring.
 * Used by backfill when ingest is skipped but score/aggregate/embed still need to run.
 */
export async function getDocumentsForWeek(
  category: string,
  weekStart: string,
  weekEnd: string,
): Promise<ContentItem[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const rows = await db
    .select({
      title: documents.title,
      content: documents.content,
      url: documents.url,
      publishedAt: documents.publishedAt,
      sourceType: documents.sourceType,
      metadata: documents.metadata,
    })
    .from(documents)
    .where(
      and(
        eq(documents.category, category),
        gte(documents.publishedAt, new Date(weekStart)),
        lte(documents.publishedAt, new Date(weekEnd)),
      ),
    )
    .orderBy(desc(documents.publishedAt));

  return rows.map((r) => {
    const meta = r.metadata as Record<string, unknown> | null;
    return {
      title: r.title,
      summary: r.content || undefined,
      link: r.url || undefined,
      pubDate: r.publishedAt?.toISOString(),
      agency: meta?.agency as string | undefined,
      type: r.sourceType,
    };
  });
}

/**
 * Get the most recent document date for a category.
 * Used by incremental snapshot to determine the fetch window.
 */
export async function getLastDocumentDate(category: string): Promise<string | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();

  const [row] = await db
    .select({ maxDate: sql<Date | null>`max(${documents.publishedAt})` })
    .from(documents)
    .where(eq(documents.category, category));

  if (!row?.maxDate) return null;
  return toDateString(row.maxDate);
}
