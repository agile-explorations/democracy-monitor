import { and, eq, ne, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { fetchLog } from '@/lib/db/schema';
import type { SignalFetchResult } from '@/lib/services/feed-fetcher';

type FetchStatus = 'complete' | 'partial' | 'failed';

/** Signal types recorded in fetch_log from the snapshot pipeline. */
const SNAPSHOT_LOGGED_TYPES = new Set(['rss', 'html', 'json', 'federal_register']);

interface FetchResultParams {
  sourceOrigin: string;
  category: string;
  weekStart: string;
  weekEnd: string;
  itemsFetched: number;
  itemsStored: number;
  errors: string[];
}

interface IncompleteWeek {
  sourceOrigin: string;
  category: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  itemsFetched: number;
  errors: string[] | null;
  fetchedAt: Date;
}

/** Determine fetch status from item and error counts. */
export function determineFetchStatus(itemCount: number, errorCount: number): FetchStatus {
  if (errorCount > 0 && itemCount === 0) return 'failed';
  if (errorCount > 0) return 'partial';
  return 'complete';
}

/** Upsert a single fetch_log row. No-op when DB is unavailable. */
export async function recordFetchResult(params: FetchResultParams): Promise<void> {
  if (!isDbAvailable()) return;

  const db = getDb();
  const status = determineFetchStatus(params.itemsFetched, params.errors.length);

  await db
    .insert(fetchLog)
    .values({
      sourceOrigin: params.sourceOrigin,
      category: params.category,
      weekStart: params.weekStart,
      weekEnd: params.weekEnd,
      status,
      itemsFetched: params.itemsFetched,
      itemsStored: params.itemsStored,
      errors: params.errors.length > 0 ? params.errors : null,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [fetchLog.sourceOrigin, fetchLog.category, fetchLog.weekStart],
      set: {
        status: sql`excluded.status`,
        itemsFetched: sql`excluded.items_fetched`,
        itemsStored: sql`excluded.items_stored`,
        errors: sql`excluded.errors`,
        fetchedAt: sql`excluded.fetched_at`,
        weekEnd: sql`excluded.week_end`,
      },
    });
}

/** Record one fetch_log row per source attempted in a week. */
export async function recordWeekFetchResults(
  category: string,
  weekStart: string,
  weekEnd: string,
  sourceResults: Record<string, { itemCount: number; errors: string[] }>,
  storedCount: number,
): Promise<void> {
  const sources = Object.keys(sourceResults);
  if (sources.length === 0) return;

  // Distribute storedCount proportionally across sources
  const totalItems = Object.values(sourceResults).reduce((s, r) => s + r.itemCount, 0);

  for (const source of sources) {
    const result = sourceResults[source];
    const proportionalStored =
      totalItems > 0 ? Math.round((result.itemCount / totalItems) * storedCount) : 0;

    await recordFetchResult({
      sourceOrigin: source,
      category,
      weekStart,
      weekEnd,
      itemsFetched: result.itemCount,
      itemsStored: proportionalStored,
      errors: result.errors,
    });
  }
}

/** Get week_start values with status='complete' for a source+category. */
export async function getCompletedWeekStarts(
  sourceOrigin: string,
  category: string,
): Promise<Set<string>> {
  if (!isDbAvailable()) return new Set();

  const db = getDb();
  const rows = await db
    .select({ weekStart: fetchLog.weekStart })
    .from(fetchLog)
    .where(
      and(
        eq(fetchLog.sourceOrigin, sourceOrigin),
        eq(fetchLog.category, category),
        eq(fetchLog.status, 'complete'),
      ),
    );

  return new Set(rows.map((r) => r.weekStart));
}

/** Get all incomplete (partial/failed) fetch_log rows, optionally filtered. */
export async function getIncompleteWeeks(
  sourceOrigin?: string,
  category?: string,
): Promise<IncompleteWeek[]> {
  if (!isDbAvailable()) return [];

  const db = getDb();
  const conditions = [ne(fetchLog.status, 'complete')];
  if (sourceOrigin) conditions.push(eq(fetchLog.sourceOrigin, sourceOrigin));
  if (category) conditions.push(eq(fetchLog.category, category));

  const rows = await db
    .select({
      sourceOrigin: fetchLog.sourceOrigin,
      category: fetchLog.category,
      weekStart: fetchLog.weekStart,
      weekEnd: fetchLog.weekEnd,
      status: fetchLog.status,
      itemsFetched: fetchLog.itemsFetched,
      errors: fetchLog.errors,
      fetchedAt: fetchLog.fetchedAt,
    })
    .from(fetchLog)
    .where(and(...conditions))
    .orderBy(fetchLog.category, fetchLog.weekStart);

  return rows;
}

/** Record RSS/HTML/JSON/FR signal results in fetch_log for gap visibility. */
export async function recordSnapshotSignalResults(
  category: string,
  weekStart: string,
  weekEnd: string,
  signalResults: SignalFetchResult[],
): Promise<void> {
  if (!isDbAvailable()) return;

  for (const result of signalResults) {
    if (!SNAPSHOT_LOGGED_TYPES.has(result.signalType)) continue;

    await recordFetchResult({
      sourceOrigin: result.signalId,
      category,
      weekStart,
      weekEnd,
      itemsFetched: result.documentCount,
      itemsStored: result.documentCount,
      errors: result.errorMessage ? [result.errorMessage] : [],
    });
  }
}
