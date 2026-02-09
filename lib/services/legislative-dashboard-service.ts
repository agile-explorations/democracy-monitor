import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { legislativeItems } from '@/lib/db/schema';
import type { LegislativeItem, LegislativeTrackingSummary } from '@/lib/types/legislative';

/**
 * Get a summary of legislative tracking data with optional filters.
 */
export async function getLegislativeSummary(options?: {
  from?: string;
  to?: string;
  category?: string;
}): Promise<LegislativeTrackingSummary> {
  const empty: LegislativeTrackingSummary = {
    totalItems: 0,
    byType: {},
    byChamber: {},
    byCategory: {},
    recentItems: [],
  };

  if (!isDbAvailable()) return empty;

  const db = getDb();
  const conditions = [];

  if (options?.from) {
    conditions.push(gte(legislativeItems.date, options.from));
  }
  if (options?.to) {
    conditions.push(lte(legislativeItems.date, options.to));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(legislativeItems)
    .where(where)
    .orderBy(desc(legislativeItems.date))
    .limit(500);

  // Filter by category if specified (categories are stored in JSONB array)
  const filtered = options?.category
    ? rows.filter((r) => (r.relevantCategories as string[]).includes(options.category!))
    : rows;

  const byType: Record<string, number> = {};
  const byChamber: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const row of filtered) {
    byType[row.type] = (byType[row.type] || 0) + 1;
    byChamber[row.chamber] = (byChamber[row.chamber] || 0) + 1;
    for (const cat of row.relevantCategories as string[]) {
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }
  }

  const recentItems: LegislativeItem[] = filtered.slice(0, 20).map((row) => ({
    id: row.govInfoId,
    title: row.title,
    type: row.type as LegislativeItem['type'],
    date: row.date,
    url: row.url,
    chamber: row.chamber as LegislativeItem['chamber'],
    committee: row.committee || undefined,
    relevantCategories: row.relevantCategories as string[],
    summary: row.summary || undefined,
  }));

  return {
    totalItems: filtered.length,
    byType,
    byChamber,
    byCategory,
    recentItems,
  };
}

/**
 * Store legislative items in the database (upsert — skip on conflict).
 */
export async function storeLegislativeItems(items: LegislativeItem[]): Promise<void> {
  if (!isDbAvailable() || items.length === 0) return;

  const db = getDb();

  for (const item of items) {
    await db
      .insert(legislativeItems)
      .values({
        govInfoId: item.id,
        title: item.title,
        type: item.type,
        date: item.date,
        url: item.url,
        chamber: item.chamber,
        committee: item.committee,
        relevantCategories: item.relevantCategories,
        summary: item.summary,
      })
      .onConflictDoNothing({ target: legislativeItems.govInfoId });
  }
}

/**
 * Get paginated legislative items with optional filters.
 */
export async function getLegislativeItems(options?: {
  from?: string;
  to?: string;
  type?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: LegislativeItem[]; total: number }> {
  if (!isDbAvailable()) return { items: [], total: 0 };

  const db = getDb();
  const conditions = [];

  if (options?.from) {
    conditions.push(gte(legislativeItems.date, options.from));
  }
  if (options?.to) {
    conditions.push(lte(legislativeItems.date, options.to));
  }
  if (options?.type) {
    conditions.push(eq(legislativeItems.type, options.type));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(options?.limit || 50, 200);
  const offset = options?.offset || 0;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(legislativeItems)
      .where(where)
      .orderBy(desc(legislativeItems.date))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(legislativeItems)
      .where(where),
  ]);

  // Filter by category post-query (JSONB array containment)
  const filtered = options?.category
    ? rows.filter((r) => (r.relevantCategories as string[]).includes(options.category!))
    : rows;

  const items: LegislativeItem[] = filtered.map((row) => ({
    id: row.govInfoId,
    title: row.title,
    type: row.type as LegislativeItem['type'],
    date: row.date,
    url: row.url,
    chamber: row.chamber as LegislativeItem['chamber'],
    committee: row.committee || undefined,
    relevantCategories: row.relevantCategories as string[],
    summary: row.summary || undefined,
  }));

  // When filtering by category post-query, total must reflect filtered count
  const total = options?.category ? filtered.length : countResult[0]?.count || 0;

  return { items, total };
}
