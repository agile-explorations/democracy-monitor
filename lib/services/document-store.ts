import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { retrievalRelevantOnly } from '@/lib/db/document-filters';
import { documents } from '@/lib/db/schema';
import { itemCountingScope } from '@/lib/services/opinion-scope-classifier';
import type { ContentItem } from '@/lib/types';
import { stripBoilerplate } from '@/lib/utils/content-cleaners';
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

/** Extract speaker name from CREC metadata, if present. */
function extractSpeaker(item: ContentItem): string | null {
  const speakers = item.metadata?.speakers as Array<{ memberName: string }> | undefined;
  return speakers?.[0]?.memberName ?? null;
}

/**
 * Upsert documents from feed items into the database for RAG retrieval.
 * No-op when DATABASE_URL is not configured.
 *
 * Returns the count of successfully stored rows. When some inserts fail (per-doc
 * try/catch swallows individual errors), an aggregate `[document-store]` warning
 * is logged so callers can detect a category-wide storage failure even when no
 * exception is thrown.
 */
function buildDocumentRow(item: ContentItem, category: string) {
  return {
    sourceType: item.type || 'rss',
    category,
    title: item.title || '(untitled)',
    content: item.content || null,
    url: item.link!,
    publishedAt: item.pubDate ? new Date(item.pubDate) : null,
    fetchedAt: new Date(),
    metadata: buildMetadata(item),
    sourceOrigin: item.sourceOrigin || inferSourceOrigin(item),
    caseId: (item.metadata?.caseId as string) ?? item.caseId ?? null,
    speaker: extractSpeaker(item),
    // Docket entries are metadata stubs by design (opinions arrive as
    // separate judicial_opinion docs) — mark at ingest so search,
    // embeddings, and corpus counts exclude them without periodic
    // SQL sweeps. Historical sweep: mark-docket-stubs (2026-07-25).
    contentType: item.type === 'court_opinion' ? 'metadata_only' : 'full_text',
    countingScope: itemCountingScope(item, category),
  };
}

export async function storeDocuments(items: ContentItem[], category: string): Promise<number> {
  if (!isDbAvailable()) return 0;

  const db = getDb();
  let stored = 0;
  let failed = 0;

  const validItems = items.filter((item) => !item.isError && !item.isWarning && item.link);

  for (const item of validItems) {
    try {
      await db
        .insert(documents)
        .values(buildDocumentRow(item, category))
        .onConflictDoUpdate({
          target: [documents.url, documents.category],
          set: {
            title: sql`excluded.title`,
            content: sql`excluded.content`,
            fetchedAt: sql`excluded.fetched_at`,
            metadata: sql`excluded.metadata`,
            sourceOrigin: sql`excluded.source_origin`,
            caseId: sql`excluded.case_id`,
            speaker: sql`excluded.speaker`,
            // Refreshed content can change scope-phrase matches.
            countingScope: sql`excluded.counting_scope`,
          },
        });
      stored++;
    } catch (err) {
      failed++;
      console.error(`Failed to store document ${item.link}:`, err);
    }
  }

  if (failed > 0) {
    console.error(
      `[document-store] ${category}: stored ${stored}/${validItems.length} (${failed} failures)`,
    );
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
      sourceOrigin: documents.sourceOrigin,
      metadata: documents.metadata,
    })
    .from(documents)
    .where(
      and(
        eq(documents.category, category),
        gte(documents.publishedAt, new Date(weekStart)),
        lte(documents.publishedAt, new Date(weekEnd)),
        retrievalRelevantOnly(),
      ),
    )
    .orderBy(desc(documents.publishedAt));

  return rows.map((r) => {
    const meta = r.metadata as Record<string, unknown> | null;
    const cleaned = r.content ? stripBoilerplate(r.content, r.sourceOrigin, r.title) : undefined;
    return {
      title: r.title,
      content: cleaned,
      link: r.url || undefined,
      pubDate: r.publishedAt?.toISOString(),
      agency: meta?.agency as string | undefined,
      type: r.sourceType,
      sourceOrigin: r.sourceOrigin || undefined,
    };
  });
}

/**
 * Get the most recent document date per source origin for a category.
 * Each source gets its own incremental window to avoid gaps when sources
 * have different publication frequencies.
 */
export async function getLastDocumentDateBySource(
  category: string,
): Promise<Record<string, string>> {
  if (!isDbAvailable()) return {};
  const db = getDb();

  const rows = await db
    .select({
      sourceOrigin: documents.sourceOrigin,
      maxDate: sql<string>`max(${documents.publishedAt})::text`,
    })
    .from(documents)
    .where(and(eq(documents.category, category), sql`${documents.sourceOrigin} IS NOT NULL`))
    .groupBy(documents.sourceOrigin);

  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.sourceOrigin && row.maxDate) {
      result[row.sourceOrigin] = toDateString(new Date(row.maxDate));
    }
  }
  return result;
}
